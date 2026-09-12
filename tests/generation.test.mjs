import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AccountStore } from '../src/core/store.mjs';
import { Generation } from '../src/server/generation.mjs';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { renderPage } from '../src/core/modules.mjs';
import { createApplication } from '../src/server/app.mjs';

const session = { installationId: 'test-installation', sessionId: 'test-browser', epoch: 1 };
const word = { inputType: 'word_phrase', sourceLanguage: 'Chinese' };
const sentence = { inputType: 'sentence', sourceLanguage: 'Chinese' };
const modules = (...types) => types.map(type => ({ id: randomUUID(), type }));
function fixture(t, provider, layout) {
  const store = new AccountStore();
  if (layout) {
    store.db.prepare('DELETE FROM layout_pages').run();
    layout.forEach((types, index) => store.db.prepare('INSERT INTO layout_pages VALUES (?, ?, ?, ?)')
      .run(randomUUID(), store.snapshot().id, index, JSON.stringify(modules(...types))));
  }
  const generation = new Generation(store, provider);
  store.openSession('open', session);
  t.after(async () => { await generation.close(); store.close(); });
  function capture(text = '幸福') {
    const payload = { session, selectedText: text, snapshot: store.snapshot() };
    const result = store.capture(randomUUID(), payload); generation.start(result.cardId); return store.card(result.cardId);
  }
  return { store, generation, capture };
}
async function finish(store, generation) {
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  for (const attempt of store.pendingAttempts(session)) {
    assert.ok(attempt.result);
    store.publish(randomUUID(), { attemptId: attempt.id, session });
  }
}

test('modules preserve exact input, order, literal markers, and skip inapplicable output without separators', async () => {
  const text = '  幸福\n';
  const output = await renderPage({ selectedText: text, modules: modules('selected', 'sentence-usage', 'selected-language', 'german-explanation'), interpretation: word,
    generate: async () => '== Chinesisch ==\n: [1] Glück' });
  assert.equal(output, `${text}\n\n${text}\nChinese\n\n== Chinesisch ==\n: [1] Glück`);
  assert.equal(await renderPage({ selectedText: text, modules: [], generate: () => assert.fail() }), '');
});

test('one shared interpretation, atomic pages, selected-only output survives a failed dependent page', async t => {
  let interpretations = 0;
  const { store, generation, capture } = fixture(t, {
    interpret: async () => { interpretations++; return word; },
    generate: async ({ module }) => { if (module.type === 'german-examples') throw Error('controlled failure'); return 'explanation'; }
  }, [['selected'], ['selected', 'german-explanation', 'german-examples'], ['selected-language']]);
  const card = capture();
  assert.equal(store.card(card.id).status, 'loading');
  await finish(store, generation);
  const saved = store.card(card.id);
  assert.equal(interpretations, 1);
  assert.equal(saved.status, 'failed');
  assert.deepEqual(saved.pages.map(page => [page.text, page.status]), [['幸福', 'completed'], ['', 'failed'], ['幸福\nChinese', 'completed']]);
  assert.deepEqual(saved.interpretation, word);
});

test('initial sentence completes an empty second page without generating an explanation', async t => {
  const { store, generation, capture } = fixture(t, { interpret: async () => sentence, generate: async () => assert.fail('inapplicable module ran') });
  const card = capture('我真的很幸福'); await finish(store, generation);
  assert.deepEqual(store.card(card.id).pages.map(page => [page.text, page.status]), [['我真的很幸福', 'completed'], ['', 'completed']]);
});

test('interpretation failure fails dependent pages, while exact selection and empty pages need no provider', async t => {
  const { store, generation, capture } = fixture(t, { interpret: async () => { throw Error('unavailable'); } }, [['selected'], [], ['selected-language']]);
  const card = capture(); await finish(store, generation);
  assert.deepEqual(store.card(card.id).pages.map(page => page.status), ['completed', 'completed', 'failed']);
});

test('repeated example modules request fresh output and fail the whole page if distinct output cannot be produced', async t => {
  let calls = 0;
  const { store, generation, capture } = fixture(t, { interpret: async () => sentence, generate: async () => { calls++; return 'same example'; } }, [['sentence-usage', 'sentence-usage']]);
  const card = capture(); await finish(store, generation);
  assert.equal(calls, 4); assert.equal(store.card(card.id).pages[0].text, ''); assert.equal(store.card(card.id).status, 'failed');
});

test('late interpretation cannot seed a new attempt after the originating browser was interrupted', async t => {
  let release;
  const { store, generation, capture } = fixture(t, { interpret: () => new Promise(resolve => { release = resolve; }), generate: async () => 'late' });
  const card = capture();
  const nextSession = { ...session, sessionId: 'new-browser', epoch: 2 };
  store.openSession('reopen', nextSession);
  store.retry('retry', { cardId: card.id, pageId: card.pages[1].page_id, session: nextSession });
  release(word);
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  assert.equal(store.card(card.id).interpretation, null);
  assert.equal(store.card(card.id).pages[1].status, 'loading');
});

test('an unsaved capture recovered after browser closure saves one failed record without restarting generation', t => {
  const { store } = fixture(t, {});
  const payload = { session, selectedText: 'original', snapshot: store.snapshot() };
  const next = { ...session, sessionId: 'new-browser', epoch: 2 };
  store.openSession('reopen', next);
  const saved = store.capture('old-capture', payload, { recoverySession: next });
  assert.equal(saved.interrupted, true);
  assert.equal(store.card(saved.cardId).status, 'failed');
  assert.equal(store.capture('old-capture', payload, { recoverySession: next }).cardId, saved.cardId);
  assert.equal(store.cards().length, 1);
});

function completion(content, finish_reason = 'stop', extra = {}) {
  return { choices: [{ finish_reason, message: { role: 'assistant', content, ...extra } }] };
}

test('OpenCode uses the Go endpoint, selected DeepSeek model, and only selection data', async () => {
  let body;
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions'); body = JSON.parse(options.body);
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    assert.equal(options.headers['User-Agent'], 'Vocabularium/0.1.0');
    assert.equal(options.headers['x-opencode-session'], 'capture-conversation');
    assert.equal(options.method, 'POST'); assert.ok(options.signal instanceof AbortSignal);
    return Response.json(completion(JSON.stringify(word)));
  } });
  assert.deepEqual(await provider.interpret('幸福', undefined, 'capture-conversation'), word);
  assert.equal(body.model, 'deepseek-v4.1-flash'); assert.equal(body.stream, false);
  assert.equal(body.messages.length, 2); assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /JSON schema/);
  assert.equal(body.messages[1].role, 'user');
  assert.deepEqual(JSON.parse(body.messages[1].content), { selectedText: '幸福' });
});

test('OpenCode rejects incomplete, refused, malformed, and wrong-schema responses', async () => {
  const provider = new OpenCodeProvider({ apiKey: 'test-only' });
  for (const result of [
    null, {}, { choices: [] }, { error: { message: 'upstream failure' } },
    completion(JSON.stringify(word), 'length'), completion(JSON.stringify(word), 'content_filter'),
    completion(JSON.stringify(word), 'stop', { refusal: 'declined' }),
    completion(JSON.stringify(word), 'stop', { role: 'user' }),
    completion(JSON.stringify(word), 'stop', { tool_calls: [{ id: 'call' }] }),
    completion(JSON.stringify(word), 'stop', { function_call: { name: 'tool' } }),
    completion(null), completion('not JSON'), completion('```json\n{}\n```'),
    ...[null, [], {}, { ...word, inputType: 'paragraph' }, { ...word, sourceLanguage: '' },
      { ...word, sourceLanguage: ['Chinese'] }, { ...word, sourceLanguage: ' ' }, { ...word, unexpected: true }]
      .map(value => completion(JSON.stringify(value)))
  ]) {
    provider.fetch = async () => Response.json(result);
    await assert.rejects(provider.interpret('幸福'));
  }
  provider.fetch = async () => new Response('<html>Gateway unavailable</html>');
  await assert.rejects(provider.interpret('幸福'), /invalid result/);
});

test('OpenCode preserves module context and literal multiline output; rejects empty or extra fields', async () => {
  const input = { module: { id: 'example-2', type: 'german-examples' }, selectedText: '幸福', interpretation: word, avoid: ['previous example'] };
  const output = '== Chinesisch (幸福, xìngfú) ==\n=== Bedeutungen ===\n: [1] Glück\n=== Beispiele ===\n: [1] 幸福就在身边。\n:: Das Glück ist ganz nah.';
  const provider = new OpenCodeProvider({ apiKey: 'test-only', model: 'configured-model', fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'configured-model');
    assert.deepEqual(JSON.parse(body.messages[1].content), { selectedText: input.selectedText, interpretation: word, instanceId: 'example-2', avoid: input.avoid });
    return Response.json(completion(JSON.stringify({ text: output })));
  } });
  assert.equal(await provider.generate(input), output);
  for (const value of [{ text: '' }, { text: ' ' }, { text: 7 }, { text: output, extra: 'ignored?' }, {}]) {
    provider.fetch = async () => Response.json(completion(JSON.stringify(value)));
    await assert.rejects(provider.generate(input), /invalid result/);
  }
});

test('OpenCode authentication and rate failures make no fallback requests and keep upstream details private', async () => {
  const provider = new OpenCodeProvider({ apiKey: 'test-only' });
  for (const status of [401, 403, 404, 429, 500]) {
    let calls = 0;
    provider.fetch = async () => { calls++; return Response.json({ error: { message: 'private upstream details' } }, { status }); };
    await assert.rejects(provider.interpret('幸福'), { message: 'The generation service could not complete this request.' });
    assert.equal(calls, 1);
  }
  await assert.rejects(new OpenCodeProvider({ apiKey: '', fetchImpl: () => assert.fail('No request without a key') }).interpret('幸福'), /not configured/);
});

test('OpenCode aborts in-flight requests when their generation is canceled', async () => {
  const controller = new AbortController();
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  const pending = provider.interpret('幸福', controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('Go requests share a stable conversation per card across interpretation, modules, and retry', async t => {
  const sessions = [];
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    sessions.push(options.headers['x-opencode-session']);
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    return Response.json(completion(JSON.stringify(input.interpretation ? { text: 'German explanation' } : word)));
  } });
  const { store, generation, capture } = fixture(t, provider);
  const first = capture(); await finish(store, generation);
  assert.deepEqual(sessions, [first.id, first.id]);
  store.retry('retry-go-page', { cardId: first.id, pageId: first.pages[1].page_id, session });
  generation.start(first.id, first.pages[1].page_id); await finish(store, generation);
  assert.deepEqual(sessions, [first.id, first.id, first.id]);
  const second = capture(); await finish(store, generation);
  assert.deepEqual(sessions.slice(3), [second.id, second.id]);
  assert.notEqual(first.id, second.id);
});

test('authenticated capture saves before generation, repeats safely, and publishes only from its origin', async t => {
  let release;
  const application = createApplication({ provider: { interpret: () => new Promise(resolve => { release = resolve; }), generate: async () => '== Chinesisch ==\n: [1] Glück' } });
  const origin = await application.start({ port: 0 });
  t.after(() => application.close());
  const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin' }) }).then(response => response.json());
  const post = async (path, body) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  await post('/api/session', { operationId: 'open', session });
  const payload = { session, selectedText: '幸福', snapshot: application.store.snapshot() };
  const captured = await post('/api/capture', { operationId: 'capture', payload });
  assert.equal(captured.status, 200); assert.equal(application.store.cards().length, 1);
  assert.equal(application.store.card(captured.body.cardId).status, 'loading');
  assert.equal((await post('/api/capture', { operationId: 'capture', payload })).body.replayed, true);
  release(word);
  await Promise.all([...application.generation.tasks.values()].map(item => item.task));
  const polled = await post('/api/poll', { session }); assert.equal(polled.body.ready.length, 2);
  for (const attemptId of polled.body.ready) assert.equal((await post('/api/publish', { operationId: `publish-${attemptId}`, payload: { attemptId, session } })).status, 200);
  assert.equal(application.store.card(captured.body.cardId).status, 'completed');
  assert.equal((await post('/api/capture', { operationId: 'invalid', payload: {} })).status, 400);
});

test('a failed result write retains the complete generated output for explicit save recovery without a new model call', async t => {
  let calls = 0;
  const { store, generation, capture } = fixture(t, { interpret: async () => word, generate: async () => { calls++; return 'complete generated page'; } });
  const stage = store.stage.bind(store);
  let failWrite = true;
  store.stage = (id, result) => { if (failWrite && result.text === 'complete generated page') throw Error('controlled disk write failure'); return stage(id, result); };
  const card = capture();
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  const back = card.pages[1];
  assert.equal(store.card(card.id).pages[1].status, 'loading');
  assert.deepEqual(generation.pendingResults.get(back.attempt_id), { ok: true, text: 'complete generated page' });
  failWrite = false;
  generation.saveResult(back.attempt_id, session);
  store.publish('recover-output', { attemptId: back.attempt_id, session });
  assert.equal(store.card(card.id).pages[1].text, 'complete generated page'); assert.equal(calls, 1);
});

test('the result recovery journal survives a failed database write and server restart without regenerating', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-result-journal-'));
  const filename = join(directory, 'account.sqlite');
  let store = new AccountStore(filename), calls = 0;
  let generation = new Generation(store, { interpret: async () => word, generate: async () => { calls++; return 'journaled result'; } });
  t.after(async () => { await generation.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
  store.openSession('open', session);
  const { cardId } = store.capture('capture', { session, selectedText: '幸福', snapshot: store.snapshot() });
  const originalStage = store.stage.bind(store);
  store.stage = (id, result) => { if (result.text === 'journaled result') throw Error('database temporarily unavailable'); return originalStage(id, result); };
  generation.start(cardId);
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  const attemptId = store.card(cardId).pages[1].attempt_id;
  assert.ok(generation.pendingResults.has(attemptId));
  await generation.close(); store.close();
  store = new AccountStore(filename); generation = new Generation(store, { interpret: async () => assert.fail(), generate: async () => assert.fail() });
  assert.deepEqual(store.attempt(attemptId).result, { ok: true, text: 'journaled result' });
  store.publish('recovered', { attemptId, session });
  assert.equal(store.card(cardId).pages[1].text, 'journaled result'); assert.equal(calls, 1);
});
