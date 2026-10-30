import assert from 'node:assert/strict';
import pg from 'pg';
import test, { createTestApplication, createTestStore } from './helpers/database.mjs';
import { legacyDatabase, migrateTo } from './helpers/legacy-database.mjs';
import { capture, complete, component, staged, useModules } from './helpers/pages.mjs';
import { FakeSpeechProvider } from './helpers/speech.mjs';
import { Audio } from '../src/server/audio.mjs';
import { ElevenLabsProvider, parseVoices } from '../src/server/elevenlabs.mjs';
import { AccountStore } from '../src/core/store.mjs';

// Spoken parts' audio (D24, increment 1): the speech provider, the audio jobs,
// their storage and API. The catalog has no spoken part yet, so these tests
// name the parts to speak themselves.

const session = { installationId: 'audio-installation', sessionId: 'audio-browser', epoch: 1 };
const settled = async (store, pageId) => {
  for (let i = 0; i < 200; i++) {
    const clips = await store.clips(pageId);
    if (clips.every(clip => clip.state === 'ready' || clip.state === 'failed')) return clips;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Audio did not settle.');
};
// A page with one completed German card.
async function germanPage(store, key = 'bank') {
  await store.openSession('open-audio', session);
  await useModules(store, ['german']);
  const { page } = await capture(store, `capture-${key}`, session, key);
  await complete(store, page, session);
  const done = await store.page(page.id);
  return { page: done, german: component(done, 'german') };
}

// ElevenLabs transport, against a stubbed fetch.
function stubFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return typeof response === 'function' ? response() : response; };
  return { calls, fetchImpl };
}

test('ElevenLabs sends the pinned model, the language code and the voice, and returns the clip with its duration', async () => {
  const mp3 = Buffer.alloc(16000, 1);
  const { calls, fetchImpl } = stubFetch(() => new Response(mp3, { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
  const events = [];
  const provider = new ElevenLabsProvider({ apiKey: 'key', voices: { de: 'voice-de', default: 'voice-any' }, fetchImpl });
  provider.diagnostic = event => events.push(event);
  const clip = await provider.synthesize({ text: 'das Ufer', language: 'de' });
  assert.equal(calls[0].url, 'https://api.elevenlabs.io/v1/text-to-speech/voice-de?output_format=mp3_44100_128');
  assert.equal(calls[0].init.headers['xi-api-key'], 'key');
  assert.deepEqual(JSON.parse(calls[0].init.body), { text: 'das Ufer', model_id: 'eleven_v4_turbo', language_code: 'de' });
  assert.equal(clip.mime, 'audio/mpeg'); assert.deepEqual(clip.bytes, mp3);
  assert.equal(clip.durationMs, 1000, '16 000 bytes at 128 kbit/s');
  assert.equal(clip.model, 'eleven_v4_turbo'); assert.equal(clip.voice, 'voice-de');
  assert.ok(events.every(event => !JSON.stringify(event).includes('das Ufer')), 'diagnostics never carry the spoken text');
  assert.equal(events.at(-1).textLength, 8);
  // A language without its own voice takes the default.
  await provider.synthesize({ text: '河岸', language: 'zh' });
  assert.match(calls[1].url, /voice-any/);
});

test('ElevenLabs maps every failure to the shared error codes', async () => {
  const failing = async (response, options = {}) => {
    const { fetchImpl } = stubFetch(() => response);
    const provider = new ElevenLabsProvider({ apiKey: 'key', voices: { default: 'v' }, fetchImpl, ...options });
    return provider.synthesize({ text: 'Bank', language: 'de' }).then(() => null, error => error.code);
  };
  assert.equal(await failing(new Response(''), { apiKey: undefined }), 'provider_unconfigured');
  assert.equal(await failing(new Response(''), { voices: {} }), 'provider_unconfigured', 'no voice for the language');
  assert.equal(await failing(new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 })), 'provider_refused');
  assert.equal(await failing(new Response('', { status: 429 })), 'provider_refused');
  assert.equal(await failing(new Response('', { status: 402 })), 'provider_refused');
  assert.equal(await failing(new Response('{"detail":"invalid key"}', { status: 401 })), 'provider_response');
  assert.equal(await failing(new Response('', { status: 500 })), 'provider_response');
  assert.equal(await failing(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })), 'provider_invalid');
  assert.equal(await failing(new Response(new Uint8Array(), { status: 200, headers: { 'content-type': 'audio/mpeg' } })), 'provider_invalid');
  assert.deepEqual(parseVoices('{"de":"a","default":"b"}'), { de: 'a', default: 'b' });
  assert.throws(() => parseVoices('[1]'), /ELEVENLABS_VOICES/);
  assert.throws(() => parseVoices('{"de":""}'), /ELEVENLABS_VOICES/);
});

test('a part is spoken one clip per line, in parallel, and its record names the speech model and voice', async t => {
  const store = await createTestStore(t);
  const { page, german } = await germanPage(store);
  await store.database.transaction(() => store.database.run('UPDATE components SET generation = $3 WHERE page_id = $1 AND id = $2',
    [page.id, german.id, JSON.stringify({ core: { model: 'text', prompt: 'p' }, pronunciation: { model: 'text', prompt: 'q' } })]));
  const provider = new FakeSpeechProvider();
  const audio = await Audio.create(store, provider);
  t.after(() => audio.close());

  await audio.speak(page.id, german.id, 'pronunciation', ['die Bank', 'das Ufer'], 'de');
  const clips = await settled(store, page.id);
  assert.deepEqual(clips.map(({ part, line, state }) => ({ part, line, state })),
    [{ part: 'pronunciation', line: 0, state: 'ready' }, { part: 'pronunciation', line: 1, state: 'ready' }]);
  assert.deepEqual(provider.calls.map(call => call.text).sort(), ['das Ufer', 'die Bank']);
  const { mime, bytes } = await store.clipAudio({ pageId: page.id, componentId: german.id, part: 'pronunciation', line: 1 });
  assert.equal(mime, 'audio/mpeg'); assert.equal(bytes.toString(), 'de:das Ufer');
  const records = await store.generationRecords(page.id);
  assert.deepEqual(records[german.id].pronunciation, { model: 'text', prompt: 'q', speech: { model: 'fake-speech', voice: 'fake-voice' } });
  assert.deepEqual(records[german.id].core, { model: 'text', prompt: 'p' }, 'a part that is not spoken keeps its record');

  // Never cached: speaking the same text again calls the provider again.
  await audio.speak(page.id, german.id, 'pronunciation', ['die Bank'], 'de');
  await settled(store, page.id);
  assert.equal(provider.calls.length, 3);
  assert.equal((await store.clips(page.id)).length, 1, 'the part keeps only its new clips');
});

test('a clip fails on its own, keeps its error, and its Retry speaks it again', async t => {
  const store = await createTestStore(t);
  const { page, german } = await germanPage(store);
  const provider = new FakeSpeechProvider({ fail: { 'das Ufer': 'provider_refused' } });
  const audio = await Audio.create(store, provider);
  t.after(() => audio.close());

  await audio.speak(page.id, german.id, 'pronunciation', ['die Bank', 'das Ufer'], 'de');
  const clips = await settled(store, page.id);
  assert.deepEqual(clips.map(({ line, state, error }) => ({ line, state, error })),
    [{ line: 0, state: 'ready', error: null }, { line: 1, state: 'failed', error: 'provider_refused' }]);
  assert.equal((await store.page(page.id)).components.find(item => item.id === german.id).status, 'completed', 'the card stays completed');

  delete provider.fail['das Ufer'];
  const key = { pageId: page.id, componentId: german.id, part: 'pronunciation', line: 1 };
  assert.equal(await audio.retry(key), true);
  assert.deepEqual((await settled(store, page.id)).map(clip => clip.state), ['ready', 'ready']);
  assert.equal(provider.calls.filter(call => call.text === 'die Bank').length, 1, 'the other clip is not spoken again');
});

test('audio jobs have their own bounds: a clip beyond them fails without a provider call', async t => {
  const store = await createTestStore(t);
  const { page, german } = await germanPage(store);
  const provider = new FakeSpeechProvider({ hold: ['eins', 'zwei'] });
  const audio = await Audio.create(store, provider, { maxActive: 1, maxQueued: 1 });
  t.after(() => audio.close());

  await audio.speak(page.id, german.id, 'pronunciation', ['eins', 'zwei', 'drei'], 'de');
  const states = async () => (await store.clips(page.id)).map(clip => [clip.line, clip.state, clip.error]);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(await states(), [[0, 'generating', null], [1, 'waiting', null], [2, 'failed', 'generation_busy']]);
  provider.release('eins'); provider.release('zwei');
  await settled(store, page.id);
  assert.deepEqual(await states(), [[0, 'ready', null], [1, 'ready', null], [2, 'failed', 'generation_busy']]);
  assert.deepEqual(provider.calls.map(call => call.text), ['eins', 'zwei']);
});

test('deleting a component cancels its audio jobs and deletes its audio', async t => {
  const store = await createTestStore(t);
  const { page, german } = await germanPage(store);
  const provider = new FakeSpeechProvider({ hold: ['die Bank'] });
  const audio = await Audio.create(store, provider);
  t.after(() => audio.close());

  await audio.speak(page.id, german.id, 'pronunciation', ['die Bank'], 'de');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await store.clips(page.id))[0].state, 'generating');
  await store.deleteComponent('delete-german', { pageId: page.id, componentId: german.id });
  await audio.cancelObsolete();
  await Promise.all([...audio.tasks.values()].map(entry => entry.task));
  assert.equal(audio.tasks.size, 0, 'the job was stopped');
  assert.deepEqual(await store.clips(page.id), []);
  assert.equal((await store.database.transaction(() => store.database.one('SELECT count(*)::int AS n FROM component_audio'))).n, 0);
});

test('a clip spoken again while generating keeps only the new version', async t => {
  const store = await createTestStore(t);
  const { page, german } = await germanPage(store);
  const provider = new FakeSpeechProvider({ hold: ['alt'] });
  const audio = await Audio.create(store, provider);
  t.after(() => audio.close());

  await audio.speak(page.id, german.id, 'pronunciation', ['alt'], 'de');
  await new Promise(resolve => setTimeout(resolve, 20));
  await audio.speak(page.id, german.id, 'pronunciation', ['neu'], 'de');
  provider.release('alt');
  await settled(store, page.id);
  const { bytes } = await store.clipAudio({ pageId: page.id, componentId: german.id, part: 'pronunciation', line: 0 });
  assert.equal(bytes.toString(), 'de:neu');
});

test('a restart fails the clips its server was still speaking', async t => {
  const store = await createTestStore(t);
  const { page, german } = await germanPage(store);
  await store.replaceClips(page.id, german.id, 'pronunciation', ['die Bank', 'das Ufer'], 'de');
  await store.claimClip({ pageId: page.id, componentId: german.id, part: 'pronunciation', line: 0 });
  const provider = new FakeSpeechProvider();
  const audio = await Audio.create(store, provider);
  t.after(() => audio.close());
  assert.deepEqual((await store.clips(page.id)).map(clip => [clip.state, clip.error]), [['failed', 'interrupted'], ['failed', 'interrupted']]);
  assert.equal(provider.calls.length, 0, 'nothing is resumed automatically');
});

test('a published card speaks its spoken parts; a facet Retry only its facet; a failed card keeps no audio', async t => {
  const store = await createTestStore(t);
  const { page, german } = await germanPage(store);
  const provider = new FakeSpeechProvider();
  const spokenParts = (moduleType, content) => moduleType === 'german' && content ? [
    { part: 'core', language: 'de', lines: ['Bank'] }, { part: 'pronunciation', language: 'de', lines: ['die Bank', 'x'.repeat(501)] }
  ] : [];
  const audio = await Audio.create(store, provider, { spokenParts });
  t.after(() => audio.close());
  const parts = async () => (await store.clips(page.id)).map(clip => `${clip.part}.${clip.line}`);

  await audio.afterPublish({ pageId: page.id, componentId: german.id, moduleType: 'german', content: german.content, state: 'completed' });
  await settled(store, page.id);
  assert.deepEqual(await parts(), ['core.0'], 'a line over 500 characters is not spoken, and neither is the rest of its part');

  provider.calls.length = 0;
  await audio.afterPublish({ pageId: page.id, componentId: german.id, moduleType: 'german', content: german.content, state: 'completed', retry: 'examples' });
  await settled(store, page.id);
  assert.equal(provider.calls.length, 0, 'a facet that is not spoken speaks nothing');
  assert.deepEqual(await parts(), ['core.0']);

  await audio.afterPublish({ pageId: page.id, componentId: german.id, moduleType: 'german', content: german.content, state: 'failed' });
  assert.deepEqual(await parts(), []);
});

test('the API lists a page\'s clips, serves a ready clip as MP3 and retries one', async t => {
  const provider = new FakeSpeechProvider({ fail: { 'das Ufer': 'provider_response' } });
  const application = await createTestApplication(t, { speechProvider: provider,
    provider: { generate: async () => ({}) } });
  const url = await application.start({ port: 0 });
  t.after(() => application.close());
  const call = async (path, body, raw = false) => {
    const token = (await (await fetch(url + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin' }) })).json()).token;
    const response = await fetch(url + path, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
    return { status: response.status, type: response.headers.get('content-type'), data: raw ? Buffer.from(await response.arrayBuffer()) : await response.json() };
  };
  const { store, audio } = application;
  const { page, german } = await germanPage(store);
  await audio.speak(page.id, german.id, 'pronunciation', ['die Bank', 'das Ufer'], 'de');
  await settled(store, page.id);

  const listed = await call(`/api/pages/${page.id}/audio`);
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.data.clips, [
    { componentId: german.id, part: 'pronunciation', line: 0, state: 'ready', durationMs: 1, url: `/api/pages/${page.id}/audio/${german.id}/pronunciation/0` },
    { componentId: german.id, part: 'pronunciation', line: 1, state: 'failed', errorCode: 'provider_response' }
  ]);
  const mp3 = await call(listed.data.clips[0].url, undefined, true);
  assert.equal(mp3.status, 200); assert.equal(mp3.type, 'audio/mpeg'); assert.equal(mp3.data.toString(), 'de:die Bank');
  assert.equal((await call(`/api/pages/${page.id}/audio/${german.id}/pronunciation/1`)).status, 409, 'a failed clip has no audio');
  assert.equal((await fetch(url + listed.data.clips[0].url)).status, 401, 'only for the signed-in owner');

  delete provider.fail['das Ufer'];
  const retried = await call(`/api/pages/${page.id}/audio/${german.id}/pronunciation/1/retry`, {});
  assert.deepEqual([retried.status, retried.data], [200, { restarted: true }]);
  assert.deepEqual((await settled(store, page.id)).map(clip => clip.state), ['ready', 'ready']);
});

test('publishing a card through the API starts its audio', async t => {
  const provider = new FakeSpeechProvider();
  const spokenParts = moduleType => moduleType === 'german' ? [{ part: 'core', language: 'de', lines: ['Bank'] }] : [];
  const application = await createTestApplication(t, { speechProvider: provider, audioOptions: { spokenParts } });
  const url = await application.start({ port: 0 });
  t.after(() => application.close());
  const { store } = application;
  await store.openSession('open-audio', session);
  await useModules(store, ['german']);
  const { page } = await capture(store, 'capture-publish', session, 'bank');
  const german = component(page, 'german');
  await store.stage(german.attemptId, staged('Bank'));
  const token = (await (await fetch(url + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin' }) })).json()).token;
  const response = await fetch(url + '/api/publish', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId: 'publish-audio', payload: { attemptId: german.attemptId, session } }) });
  assert.equal(response.status, 200);
  assert.deepEqual((await settled(store, page.id)).map(clip => [clip.part, clip.state]), [['core', 'ready']]);
  assert.deepEqual(provider.calls, [{ text: 'Bank', language: 'de', voice: 'fake-voice' }]);
});

test('0018 adds empty audio storage and keeps every deck, page and component (D24)', async t => {
  const database = await legacyDatabase(t, 'speech-audio-upgrade', 17);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  const parent = JSON.stringify({ version: 1, blocks: [{ type: 'parent', header: { kind: 'word', language: 'Englisch', key: 'bank' }, core: '1. Ufer', facets: {} }] });
  await client.query(`INSERT INTO decks (id, name) VALUES ('deck', 'Bank words');
    INSERT INTO account VALUES (1, 'deck');
    INSERT INTO pages (id, deck_id, selected_text, created_at) VALUES ('page', 'deck', 'bank', '2026-10-20T10:00:00.000Z');`);
  await client.query(`INSERT INTO components (page_id, id, module_instance_id, module_type, position, content, status, facets) VALUES
    ('page', 'key', 'k', 'main-key', 0, '{"version":1,"blocks":[{"type":"paragraph","text":"bank"}]}', NULL, '{}'),
    ('page', 'german', 'g', 'german', 1, $1, 'completed', '{}')`, [parent]);
  const tables = ['account', 'decks', 'deck_modules', 'credentials', 'login_tokens', 'installations', 'pages', 'components'];
  const rows = async table => (await client.query(`SELECT to_jsonb(t) AS row FROM "${table}" t`)).rows.map(({ row }) => JSON.stringify(row)).sort();
  const kept = {};
  for (const table of tables) kept[table] = await rows(table);

  await migrateTo(t, database, 18);

  for (const table of tables) assert.deepEqual(await rows(table), kept[table], table);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM component_audio')).rows[0].n, 0, 'earlier components have no audio');
  await assert.rejects(client.query(`INSERT INTO component_audio (page_id, component_id, part, line, text, language, token, state, created_at)
    VALUES ('page', 'german', 'core', 0, 'bank', 'en', 't', 'ready', 'now')`), /component_audio_ready/, 'a ready clip needs its audio');
  await client.query(`INSERT INTO component_audio (page_id, component_id, part, line, text, language, token, created_at)
    VALUES ('page', 'german', 'core', 0, 'bank', 'en', 't', 'now')`);
  await client.query("DELETE FROM pages WHERE id = 'page'");
  assert.equal((await client.query('SELECT count(*)::int AS n FROM component_audio')).rows[0].n, 0, 'audio goes with its page');
  const store = await AccountStore.open(database); database.resources.push(store);
  assert.deepEqual(await store.pendingClips(), []);
});
