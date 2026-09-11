import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AccountStore } from '../src/core/store.mjs';
import { Generation } from '../src/server/generation.mjs';
import { OpenAIProvider } from '../src/server/openai.mjs';
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

test('OpenAI requests use structured output, selected data only, and reject incomplete/refused/invalid output', async () => {
  let body;
  const provider = new OpenAIProvider({ apiKey: 'test-only', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); body = JSON.parse(options.body);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(word) }] }] });
  } });
  assert.deepEqual(await provider.interpret('幸福'), word);
  assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
  assert.deepEqual(JSON.parse(body.input), { selectedText: '幸福' });
  for (const result of [
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not JSON' }] }] }
  ]) {
    provider.fetch = async () => Response.json(result);
    await assert.rejects(provider.interpret('幸福'));
  }
  await assert.rejects(new OpenAIProvider({ apiKey: '' }).interpret('幸福'), /not configured/);
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
