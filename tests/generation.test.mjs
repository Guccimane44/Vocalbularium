import test, { createTestStore, createTestApplication } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Generation } from '../src/server/generation.mjs';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { moduleInstructions as parentInstructions, moduleSchema as parentSchema, promptVersion } from '@vocabularium/domain/composer';
import { generateComponents } from '@vocabularium/domain/modules';
import { facetsOf } from '@vocabularium/domain/parents';
import { formatContent, withKeyHighlighted } from '@vocabularium/domain/content';
// Generated content as stored: formatted, with the main key highlighted (D10, amended a fourth time).
// The prompt version of German's whole attempt on a word (D11); the fake provider names no model.
const GERMAN_WORD_PROMPT = promptVersion({ instructions: parentInstructions('german', facetsOf('german')), schema: parentSchema('german', facetsOf('german')) });
const keyed = (value, key = 'bank') => withKeyHighlighted(formatContent('german', value), key);
import { plainLines } from '@vocabularium/domain/markdown';
import { isContentType } from '@vocabularium/domain/page-modules';
import { confirmed, generated, resultFor, sentenceResult, text, textBlocks, useModules, wordResult, staged } from './helpers/pages.mjs';

const session = { installationId: 'test-installation', sessionId: 'test-browser', epoch: 1 };
const modules = (...types) => types.map(type => ({ id: randomUUID(), type }));
// Without explicit types the deck has a sentence example, which completes empty for a word
// without a model call, followed by an explanation.
// One German parent by default: every parent applies to every input (D08).
async function fixture(t, provider, types = ['german'], options) {
  const store = await createTestStore(t);
  await useModules(store, types);
  const generation = await Generation.create(store, provider, options);
  await store.openSession('open', session);
  t.after(async () => { await generation.close(); await store.close(); });
  async function capture(mainKey = '幸福') {
    const result = await store.capture(randomUUID(), { session, mainKey, snapshot: (await store.snapshot()) });
    await generation.start(result.pageId); return await store.page(result.pageId);
  }
  return { store, generation, capture };
}
async function finish(store, generation) {
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  for (const attempt of (await store.pendingAttempts(session))) {
    assert.ok(attempt.result);
    await store.publish(randomUUID(), { attemptId: attempt.id, session });
  }
}
const outcome = async (store, page) => generated(await store.page(page.id)).map(item => [text(item), item.status]);
const retryComponent = (store, id, page, index, retrySession = session) =>
  confirmed(store, id, { pageId: page.id, target: { scope: 'component', componentId: generated(page)[index].id }, session: retrySession });

test('bounded generation queues component attempts and fails an overloaded saved capture without provider work', async t => {
  const store = await createTestStore(t);
  await useModules(store, ['chinese']);
  await store.openSession('open', session);
  let releaseFirst, firstStarted;
  const started = new Promise(resolve => { firstStarted = resolve; });
  const events = [];
  let calls = 0, secondAttemptId, secondSettled;
  const settled = new Promise(resolve => { secondSettled = resolve; });
  const generation = await Generation.create(store, {
    generate: (request, signal) => {
      calls++;
      if (calls > 1) return Promise.resolve(resultFor(request, 'generated text'));
      return new Promise((resolve, reject) => {
        releaseFirst = () => resolve(resultFor(request, 'generated text')); firstStarted();
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }
  }, { maxActive: 1, maxQueued: 1, diagnostic: event => {
    events.push(event);
    if (event.event === 'settled' && event.attemptId === secondAttemptId) secondSettled();
  } });
  t.after(async () => { await generation.close(); await store.close(); });
  const capture = async id => {
    const { pageId } = await store.capture(id, { session, mainKey: 'private selection', snapshot: await store.snapshot() });
    await generation.start(pageId);
    return store.page(pageId);
  };
  const first = await capture('first');
  await started;
  const second = await capture('second');
  secondAttemptId = generated(second)[0].attemptId;
  const third = await capture('third');
  assert.equal(generation.tasks.size, 1);
  assert.equal(generation.queue.length, 1);
  assert.equal(calls, 1);
  assert.equal(generated(await store.page(third.id))[0].status, 'failed');
  assert.equal((await store.page(third.id)).status, 'failed');
  assert.equal(events.some(event => event.category === 'generation_busy' && event.event === 'rejected'), true);
  assert.equal(JSON.stringify(events).includes('private selection'), false);
  releaseFirst();
  await settled;
  assert.equal(calls, 2, 'only admitted captures contacted the provider');
  assert.equal((await store.page(first.id)).status, 'loading', 'publication remains explicit');
  await finish(store, generation);
  assert.equal((await store.page(second.id)).status, 'completed');
});

test('a busy confirmed Retry returns 429 and preserves component content and attempt identity', async t => {
  let release, started;
  let calls = 0;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const application = await createTestApplication(t, {
    generationOptions: { maxActive: 1, maxQueued: 0 },
    provider: {
      generate: (request, signal) => ++calls > 1 ? Promise.resolve(resultFor(request, 'generated text')) : new Promise((resolve, reject) => {
        release = () => resolve(resultFor(request, 'generated text')); started();
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })
    }
  });
  t.after(() => application.close());
  const { store, generation } = application;
  await useModules(store, ['chinese']);
  await store.openSession('open', session);
  const snapshot = await store.snapshot();
  const targetId = (await store.capture('target', { session, mainKey: 'target', snapshot })).pageId;
  const target = generated(await store.page(targetId))[0];
  await store.stage(target.attemptId, staged('preserve me'));
  await store.publish('target-publish', { attemptId: target.attemptId, session });
  const busyId = (await store.capture('busy', { session, mainKey: 'busy', snapshot })).pageId;
  await generation.start(busyId);
  await providerStarted;
  const url = await application.start({ port: 0 });
  const login = await fetch(url + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }) }).then(response => response.json());
  const retry = (operationId, confirmation) => fetch(url + '/api/page/generate', { method: 'POST', headers: {
    'Content-Type': 'application/json', Authorization: `Bearer ${login.token}`
  }, body: JSON.stringify({ operationId, payload: { pageId: targetId, target: { scope: 'component', componentId: target.id }, session, confirmation } }) });
  const unconfirmed = await retry('busy-retry');
  assert.equal(unconfirmed.status, 409);
  const { code, details: { confirmation } } = await unconfirmed.json();
  assert.equal(code, 'confirmation_required');
  const response = await retry('busy-retry', confirmation);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'generation_busy');
  assert.equal(await store.database.transaction(() => store.database.one(
    'SELECT operation_id FROM receipts WHERE operation_id = $1', ['busy-retry'])), undefined);
  const after = generated(await store.page(targetId))[0];
  assert.equal(text(after), 'preserve me');
  assert.equal(after.attemptId, target.attemptId);
  assert.equal(after.status, 'completed', 'its earlier state stays');
  release();
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  await generation.cancelObsolete();
  const accepted = await retry('fresh-retry', confirmation);
  assert.equal(accepted.status, 200);
  const retried = generated(await store.page(targetId))[0];
  assert.equal(text(retried), '');
  assert.equal(retried.status, 'loading');
  assert.notEqual(retried.attemptId, target.attemptId);
});

test('a multi-component request reserves all its slots or none', async t => {
  const pending = (_text, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const { generation, capture } = await fixture(t, { generate: (_request, signal) => pending(undefined, signal) }, ['chinese'], { maxActive: 1, maxQueued: 2 });
  await capture();
  assert.equal(generation.occupied(), 1);
  assert.equal(generation.reserve(3), null);
  const reservation = generation.reserve(2);
  assert.ok(reservation);
  assert.equal(generation.reserve(1), null);
  generation.release(reservation);
  assert.ok(generation.reserve(2));
});

test('session invalidation aborts an active request and removes queued work', async t => {
  const store = await createTestStore(t);
  await useModules(store, ['chinese']);
  await store.openSession('open', session);
  let started, aborted = 0, calls = 0;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const generation = await Generation.create(store, {
    generate: (_request, signal) => {
      calls++;
      started();
      return new Promise((_, reject) => signal.addEventListener('abort', () => {
        aborted++; reject(signal.reason);
      }, { once: true }));
    }
  }, { maxActive: 1, maxQueued: 1 });
  t.after(async () => { await generation.close(); await store.close(); });
  const capture = async id => {
    const { pageId } = await store.capture(id, { session, mainKey: 'word', snapshot: await store.snapshot() });
    await generation.start(pageId);
    return pageId;
  };
  const first = await capture('first');
  await providerStarted;
  const second = await capture('second');
  assert.equal(generation.queue.length, 1);
  await store.openSession('next', { ...session, sessionId: 'next-browser', epoch: 2 });
  await generation.cancelObsolete();
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  assert.equal(aborted, 1);
  assert.equal(calls, 1, 'the queued attempt never contacted the provider');
  assert.equal(generation.queue.length, 0);
  assert.equal((await store.page(first)).status, 'failed');
  assert.equal((await store.page(second)).status, 'failed');
});

test('an obsolete request is canceled even when the same page has a new-session retry', async t => {
  const signals = [], releases = [], started = [];
  const firstStarted = new Promise(resolve => { started[0] = resolve; });
  const secondStarted = new Promise(resolve => { started[1] = resolve; });
  const { store, generation, capture } = await fixture(t, {
    generate: (request, signal) => {
      const index = signals.push(signal) - 1;
      return new Promise((resolve, reject) => {
        releases[index] = () => resolve(resultFor(request, 'generated text')); started[index]();
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }
  }, ['chinese'], { maxActive: 2, maxQueued: 0 });
  const page = await capture('word');
  await firstStarted;
  const nextSession = { ...session, sessionId: 'next-browser', epoch: 2 };
  await store.openSession('next', nextSession);
  const { attemptIds } = await retryComponent(store, 'retry', await store.page(page.id), 0, nextSession);
  await generation.start(page.id, attemptIds);
  await secondStarted;
  await generation.cancelObsolete();
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  releases[1]();
  await Promise.all([...generation.tasks.values()].map(item => item.task));
});

test('diagnostic failures cannot turn an admitted saved capture into a failed request', async t => {
  const { store, generation, capture } = await fixture(t, { generate: async request => resultFor(request, 'text') }, undefined,
    { diagnostic: () => { throw new Error('logger unavailable'); } });
  const page = await capture('word');
  await finish(store, generation);
  assert.equal((await store.page(page.id)).status, 'completed');
});

test('modules receive the exact main key and keep literal markers', async () => {
  const input = '  幸福\n';
  const received = [];
  const outcomes = await generateComponents({
    mainKey: input, modules: modules('chinese', 'chinese'),
    generate: async request => { received.push(request.selectedText); return resultFor(request, '<b>幸福</b> & 快乐'); }
  });
  assert.deepEqual(outcomes.map(item => plainLines(item.content.core)[0]), ['<b>幸福</b> & 快乐', '<b>幸福</b> & 快乐']);
  assert.deepEqual(received, [input, input]);
});

test('one request per module and none shared by the run; components fail independently (D17)', async (t) => {
  const requests = [];
  const { store, generation, capture } = await fixture(t, {
    generate: async request => { requests.push(request.module.type); if (request.module.type === 'german') throw Error('controlled failure'); return resultFor(request, 'explanation'); }
  }, ['chinese', 'german', 'chinese']);
  const page = await capture();
  assert.equal((await store.page(page.id)).status, 'loading');
  await finish(store, generation);
  assert.deepEqual(requests.sort(), ['chinese', 'chinese', 'german'], 'exactly one request per module, nothing before them');
  assert.equal((await store.page(page.id)).status, 'failed');
  assert.deepEqual(await outcome(store, page), [['explanation', 'completed'], ['', 'failed'], ['explanation', 'completed']]);
});

test('repeated modules generate independently, even when they produce the same text', async (t) => {
  let calls = 0;
  const { store, generation, capture } = await fixture(t, { generate: async request => { calls++; return resultFor(request, 'same example'); } }, ['chinese', 'chinese']);
  const page = await capture(); await finish(store, generation);
  assert.equal(calls, 2);
  assert.deepEqual(await outcome(store, page), [['same example', 'completed'], ['same example', 'completed']]);
});

// Parent modules (D08): one call for the core and the facets that apply.
async function parentFixture(t, provider, facets = ['article', 'examples', 'synonyms', 'antonyms']) {
  const result = await fixture(t, provider, []);
  const deck = await result.store.deck((await result.store.snapshot()).id);
  await result.store.saveDeck('german', { deck: { ...deck, modules: [deck.modules[0], { id: 'g', type: 'german', facets }] } });
  return result;
}
// A German noun (D17): its grammatical role lets Article apply.
const BANK = (({ core, facets }) => ({ core: { ...core, gramRole: 'noun' }, facets }))(wordResult(['Ufer'], { article: { singular: 'das Ufer', plural: 'die Ufer' },
  examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }] }, { key: 'bank' }));
const data = async (store, page) => (await store.page(page.id)).components.filter(item => item.moduleType === 'german').map(item => item.content.blocks[0]);

test('a parent writes its core, its reading of the key and its facets in one call, as structured content (D09, D17)', async (t) => {
  const requests = [];
  const { store, generation, capture } = await parentFixture(t, {
    generate: async request => { requests.push(request); return request.selectedText.endsWith('.')
      ? sentenceResult('Wir saßen am Ufer.', { examples: [{ sentence: 'We stood by the river.', translation: 'Wir standen am Fluss.' }] }, { key: request.selectedText }) : BANK; }
  });
  const wordPage = await capture('bank'); await finish(store, generation);
  const sentencePage = await capture('We sat on the bank.'); await finish(store, generation);
  assert.deepEqual(requests.map(request => [request.module.type, request.facets]),
    [['german', ['article', 'examples', 'synonyms', 'antonyms']], ['german', ['article', 'examples', 'synonyms', 'antonyms']]], 'each request asks for every facet');
  assert.deepEqual(await data(store, wordPage), [{ type: 'parent', ...keyed(BANK) }], 'stored as one parent block of markdown; a facet left out, like Synonyms, has none');
  assert.equal((await outcome(store, sentencePage))[0][1], 'completed', 'a parent never completes empty for a sentence');
  assert.equal((await data(store, sentencePage))[0].header.kind, 'sentence', 'the card records its own reading');
  assert.ok(!('interpretation' in await store.page(sentencePage.id)));
});

test('a parent drops entries of facets it does not have, and fails on a result outside its shape', async (t) => {
  const replies = [{ ...BANK, facets: { ...BANK.facets, antonyms: ['Strom'] } }, { text: '== Englisch ==\n: [1] Ufer' }, { core: { kind: 'sentence', translation: 'an earlier shape' }, facets: {} },
    wordResult(['Ufer'], { examples: [{ translation: 'only a translation' }] })];
  const { store, generation, capture } = await parentFixture(t, { generate: async () => replies.shift() }, ['article', 'examples']);
  const kept = await capture('bank'); await finish(store, generation);
  assert.deepEqual(await data(store, kept), [{ type: 'parent', ...keyed(BANK) }]);
  for (let index = 0; index < 3; index++) {
    const wrong = await capture('bank'); await finish(store, generation);
    assert.deepEqual(await outcome(store, wrong), [['', 'failed']], `refused reply ${index + 2}`);
  }
});

test('a provider resolving after abort cannot stage output from an interrupted browser session', async (t) => {
  let release, started, signal;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const { store, generation, capture } = await fixture(t, { generate: (request, providerSignal) => new Promise(resolve => {
    signal = providerSignal; release = () => resolve(resultFor(request, 'late')); started();
  }) });
  const page = await capture();
  await providerStarted;
  const old = generated(page)[0];
  const nextSession = { ...session, sessionId: 'new-browser', epoch: 2 };
  await store.openSession('reopen', nextSession);
  await retryComponent(store, 'retry', await store.page(page.id), 0, nextSession);
  await generation.cancelObsolete();
  assert.equal(signal.aborted, true);
  release();
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  assert.equal(generated(await store.page(page.id))[0].status, 'loading');
  assert.equal((await store.attempt(old.attemptId)).result, null);
  assert.equal(generation.pendingResults.has(old.attemptId), false);
});

test('a late module response after cancellation is discarded before result staging', async t => {
  let release, started, providerSignal;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const { store, generation, capture } = await fixture(t, {
    generate: (_input, signal) => new Promise(resolve => {
      providerSignal = signal; release = resolve; started();
    })
  }, ['chinese']);
  const page = await capture('word');
  await providerStarted;
  const { attemptId } = generated(page)[0];
  await store.openSession('next', { ...session, sessionId: 'next-browser', epoch: 2 });
  await generation.cancelObsolete();
  assert.equal(providerSignal.aborted, true);
  release('late generated output');
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  assert.equal((await store.attempt(attemptId)).result, null);
  assert.equal(generated(await store.page(page.id))[0].status, 'failed');
  assert.equal(generation.pendingResults.has(attemptId), false);
});

test('an unsaved capture recovered after browser closure saves one failed record without restarting generation', async (t) => {
  const { store } = await fixture(t, {});
  const payload = { session, mainKey: 'original', snapshot: (await store.snapshot()) };
  const next = { ...session, sessionId: 'new-browser', epoch: 2 };
  await store.openSession('reopen', next);
  const saved = await store.capture('old-capture', payload, { recoverySession: next });
  assert.equal(saved.interrupted, true);
  assert.equal((await store.page(saved.pageId)).status, 'failed');
  assert.equal((await store.capture('old-capture', payload, { recoverySession: next })).pageId, saved.pageId);
  assert.equal((await store.pages()).length, 1);
});

function completion(content, finish_reason = 'stop', extra = {}) {
  return { choices: [{ finish_reason, message: { role: 'assistant', content, ...extra } }] };
}
// One German request and a valid reply to it (D17: one request per module).
const GERMAN = { module: { id: 'g', type: 'german' }, selectedText: '幸福', facets: [] };
const REPLY = { core: { kind: 'word', language: 'Chinesisch', key: '幸福', meanings: ['Glück'] }, facets: {} };

test('OpenCode uses the Go endpoint, selected DeepSeek model, and only selection data', async () => {
  let body;
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions'); body = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      assert.equal(options.headers['User-Agent'], 'Vocabularium/0.11.0');
      assert.equal(options.headers['x-opencode-session'], 'capture-conversation');
      assert.equal(options.method, 'POST'); assert.ok(options.signal instanceof AbortSignal);
      return Response.json(completion(JSON.stringify(REPLY)));
    }
  });
  assert.deepEqual(await provider.generate({ ...GERMAN, sessionId: 'capture-conversation' }), REPLY);
  assert.equal(body.model, 'deepseek-v4.1-flash'); assert.equal(body.stream, false);
  assert.equal(body.messages.length, 2); assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /JSON schema/);
  assert.equal(body.messages[1].role, 'user');
  assert.deepEqual(JSON.parse(body.messages[1].content), { selectedText: '幸福', instanceId: 'g' });
});

test('OpenCode rejects incomplete, refused, malformed, and wrong-schema responses', async () => {
  const provider = new OpenCodeProvider({ apiKey: 'test-only' });
  for (const result of [
    null, {}, { choices: [] }, { error: { message: 'upstream failure' } },
    completion(JSON.stringify(REPLY), 'length'), completion(JSON.stringify(REPLY), 'content_filter'),
    completion(JSON.stringify(REPLY), 'stop', { refusal: 'declined' }),
    completion(JSON.stringify(REPLY), 'stop', { role: 'user' }),
    completion(JSON.stringify(REPLY), 'stop', { tool_calls: [{ id: 'call' }] }),
    completion(JSON.stringify(REPLY), 'stop', { function_call: { name: 'tool' } }),
    completion(null), completion('not JSON'), completion('```json\n{}\n```'),
    ...[null, [], {}, { ...REPLY, unexpected: true }, { inputType: 'word_phrase' }]
      .map(value => completion(JSON.stringify(value)))
  ]) {
    provider.fetch = async () => Response.json(result);
    await assert.rejects(provider.generate(GERMAN));
  }
  provider.fetch = async () => new Response('<html>Gateway unavailable</html>');
  await assert.rejects(provider.generate(GERMAN), /invalid result/);
});

test('OpenCode passes module context and returns the structured result; rejects a result without its parts or with extra fields', async () => {
  const input = { module: { id: 'example-2', type: 'german' }, selectedText: '幸福', facets: ['examples'] };
  const output = { core: { kind: 'word', language: 'Chinesisch', key: '幸福', romanization: 'xìngfú', meanings: ['Glück'] },
    facets: { examples: [{ sentence: '幸福就在身边。', translation: 'Das Glück ist ganz nah.' }] } };
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', model: 'configured-model', fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'configured-model');
      assert.deepEqual(JSON.parse(body.messages[1].content), { selectedText: input.selectedText, instanceId: 'example-2' }, 'no input type: the core reads the key (D17)');
      return Response.json(completion(JSON.stringify(output)));
    }
  });
  assert.deepEqual(await provider.generate(input), output);
  const withContext = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    assert.equal(JSON.parse(JSON.parse(options.body).messages[1].content).context, 'surrounding text');
    return Response.json(completion(JSON.stringify(output)));
  } });
  assert.deepEqual(await withContext.generate({ ...input, context: 'surrounding text' }), output);
  for (const value of [{ text: 'markup' }, { core: output.core }, { core: 'text', facets: {} }, { core: output.core, facets: [] }, { ...output, extra: 'ignored?' }, {}]) {
    provider.fetch = async () => Response.json(completion(JSON.stringify(value)));
    await assert.rejects(provider.generate(input), /invalid result/, JSON.stringify(value));
  }
  // A reply whose core lacks only its closing brace before "facets" is
  // repaired; any other malformed reply stays invalid.
  const text = JSON.stringify(output);
  const slipped = text.replace('},"facets"', ',"facets"');
  provider.fetch = async () => Response.json(completion(slipped));
  assert.deepEqual(await provider.generate(input), output);
  for (const reply of [slipped.slice(0, -1), `${slipped.slice(0, -1)},"kind":"word"}`,
    text.replace(']},"facets"', '},"facets"'), `${text.slice(0, -1)},"kind":"word"}`, slipped.replace(',"facets"', '"facets"')]) {
    provider.fetch = async () => Response.json(completion(reply));
    await assert.rejects(provider.generate(input), /invalid result/, reply);
  }
  provider.fetch = async () => Response.json(completion('{"inputType":"word_phrase","facets":{}'));
  await assert.rejects(provider.generate(input), /invalid result/);
});

test('OpenCode authentication and rate failures make no fallback requests and keep upstream details private', async () => {
  const provider = new OpenCodeProvider({ apiKey: 'test-only' });
  for (const status of [401, 403, 404, 429, 500]) {
    let calls = 0;
    provider.fetch = async () => { calls++; return Response.json({ error: { message: 'private upstream details' } }, { status }); };
    await assert.rejects(provider.generate(GERMAN), { message: 'The generation service could not complete this request.' });
    assert.equal(calls, 1);
  }
  await assert.rejects(new OpenCodeProvider({ apiKey: '', fetchImpl: () => assert.fail('No request without a key') }).generate(GERMAN), /not configured/);
});

test('OpenCode aborts in-flight requests when their generation is canceled', async () => {
  const controller = new AbortController();
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })
  });
  const pending = provider.generate(GERMAN, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('Go requests share a stable conversation per page; each retry is one new request', async (t) => {
  const sessions = [];
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', fetchImpl: async (_, options) => {
      sessions.push(options.headers['x-opencode-session']);
      return Response.json(completion(JSON.stringify(REPLY)));
    }
  });
  const { store, generation, capture } = await fixture(t, provider);
  const first = await capture(); await finish(store, generation);
  assert.deepEqual(sessions, [first.id]);
  const { attemptIds } = await retryComponent(store, 'retry-go', await store.page(first.id), 0);
  await generation.start(first.id, attemptIds); await finish(store, generation);
  assert.deepEqual(sessions, Array(2).fill(first.id));
  const second = await capture(); await finish(store, generation);
  assert.deepEqual(sessions.slice(2), [second.id]);
  assert.notEqual(first.id, second.id);
});

test('generation passes the saved Context to each module’s request', async (t) => {
  const seen = [];
  const { store, generation } = await fixture(t, {
    generate: async request => { seen.push(['generate', request.selectedText, request.context]); return resultFor(request, 'explained'); }
  }, ['context', 'chinese']);
  const { pageId } = await store.capture('with-context', { session, mainKey: 'Bismarck', context: 'Otto von Bismarck, chancellor', snapshot: await store.snapshot() });
  await generation.start(pageId); await finish(store, generation);
  assert.deepEqual(seen, [['generate', 'Bismarck', 'Otto von Bismarck, chancellor']]);
});

test('authenticated capture saves before generation, repeats safely, and publishes only from its origin', async (t) => {
  let release;
  const application = await createTestApplication(t, { provider: { generate: request => new Promise(resolve => { release = () => resolve(resultFor(request, 'Glück')); }) } });
  const origin = await application.start({ port: 0 });
  t.after(() => application.close());
  const login = await fetch(origin + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin' }) }).then(response => response.json());
  const post = async (path, body) => {
    const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  await post('/api/session', { operationId: 'open', session });
  const payload = { session, mainKey: '幸福', snapshot: (await application.store.snapshot()) };
  const captured = await post('/api/capture', { operationId: 'capture', payload });
  assert.equal(captured.status, 200); assert.equal((await application.store.pages()).length, 1);
  assert.equal((await application.store.page(captured.body.pageId)).status, 'loading');
  assert.equal((await post('/api/capture', { operationId: 'capture', payload })).body.replayed, true);
  release();
  await Promise.all([...application.generation.tasks.values()].map(item => item.task));
  const polled = await post('/api/poll', { session }); assert.equal(polled.body.ready.length, payload.snapshot.modules.filter(module => isContentType(module.type)).length);
  for (const attemptId of polled.body.ready) assert.equal((await post('/api/publish', { operationId: `publish-${attemptId}`, payload: { attemptId, session } })).status, 200);
  assert.equal((await application.store.page(captured.body.pageId)).status, 'completed');
  assert.equal((await post('/api/capture', { operationId: 'invalid', payload: {} })).status, 400);
});

test('a failed result write retains the complete generated output for explicit save recovery without a new model call', async (t) => {
  let calls = 0;
  const { store, generation, capture } = await fixture(t, { generate: async request => { calls++; return resultFor(request, 'complete generated text'); } });
  const stage = store.stage.bind(store);
  let failWrite = true;
  store.stage = (id, result) => { if (failWrite && plainLines(result.content?.core ?? '')[0] === 'complete generated text') throw Error('controlled disk write failure'); return stage(id, result); };
  const page = await capture();
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  const back = generated(page)[0];
  assert.equal(generated(await store.page(page.id))[0].status, 'loading');
  assert.deepEqual(generation.pendingResults.get(back.attemptId), { ok: true, content: formatContent('german', wordResult('complete generated text', {}, { key: '幸福' })), generation: { model: null, prompt: GERMAN_WORD_PROMPT } });
  assert.equal(generation.failedResults.has(back.attemptId), true);
  failWrite = false;
  await generation.saveResult(back.attemptId, session);
  assert.equal(generation.failedResults.has(back.attemptId), false);
  await store.publish('recover-output', { attemptId: back.attemptId, session });
  assert.equal(text(generated(await store.page(page.id))[0]), 'complete generated text'); assert.equal(calls, 1);
});

test('an in-progress result write does not advertise save recovery', async t => {
  const { store, generation, capture } = await fixture(t, {
    generate: async request => resultFor(request, 'staged later')
  });
  const stage = store.stage.bind(store);
  let releaseStage, signalStage;
  const started = new Promise(resolve => { signalStage = resolve; });
  store.stage = async (id, result) => {
    if (plainLines(result.content?.core ?? '')[0] === 'staged later') {
      signalStage();
      await new Promise(resolve => { releaseStage = resolve; });
    }
    return stage(id, result);
  };
  const page = await capture();
  await started;
  const { attemptId } = generated(page)[0];
  assert.equal(generation.pendingResults.has(attemptId), true);
  assert.equal(generation.failedResults.has(attemptId), false);
  releaseStage();
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  assert.equal(generation.pendingResults.has(attemptId), false);
  assert.equal(generation.failedResults.has(attemptId), false);
  assert.deepEqual((await store.attempt(attemptId)).result, { ok: true, content: formatContent('german', wordResult('staged later', {}, { key: '幸福' })), generation: { model: null, prompt: GERMAN_WORD_PROMPT } });
});

test('the result recovery journal survives a failed database write and server restart without regenerating', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-result-journal-'));
  const databaseKey = join(directory, 'account-fixture');
  let store = await createTestStore(t, databaseKey), calls = 0;
  let generation = await Generation.create(store, { generate: async request => { calls++; return resultFor(request, 'journaled result'); } });
  t.after(async () => { await generation.close(); await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.openSession('open', session);
  const { pageId } = await store.capture('capture', { session, mainKey: '幸福', snapshot: (await store.snapshot()) });
  const originalStage = store.stage.bind(store);
  store.stage = (id, result) => { if (plainLines(result.content?.core ?? '')[0] === 'journaled result') throw Error('database temporarily unavailable'); return originalStage(id, result); };
  await generation.start(pageId);
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  const { attemptId } = generated(await store.page(pageId))[0];
  assert.ok(generation.pendingResults.has(attemptId));
  await generation.close();
  await store.close();
  store = (await createTestStore(t, databaseKey)); generation = (await Generation.create(store, { generate: async () => assert.fail() }));
  // My Deck's German has its four first facets (K56).
  const four = ['article', 'examples', 'synonyms', 'antonyms'];
  const prompt = promptVersion({ instructions: parentInstructions('german', four), schema: parentSchema('german', four) });
  assert.deepEqual((await store.attempt(attemptId)).result, { ok: true, content: formatContent('german', wordResult('journaled result', {}, { key: '幸福' })), generation: { model: null, prompt } });
  await store.publish('recovered', { attemptId, session });
  assert.equal(text(generated(await store.page(pageId))[0]), 'journaled result'); assert.equal(calls, 1);
});

test('OpenCode asks a parent for its core, its flags first, and the facets asked for as JSON, without markup (D09, D17)', async () => {
  const german = parentInstructions('german', ['article', 'synonyms']);
  assert.match(german, /"kind": "<word \| sentence>"/);
  assert.match(german, /"gramRole"/);
  assert.match(german, /only when "gramRole" is noun/, 'a facet says when it applies');
  assert.ok(german.indexOf('"article"') < german.indexOf('"synonyms"'));
  assert.doesNotMatch(german, /"examples"|"antonyms"|===|\[1\]/);
  const chinese = parentInstructions('chinese', ['examples', 'pinyin']);
  assert.doesNotMatch(chinese, /gramRole/, 'Chinese has no grammatical role');
  assert.match(chinese, /simplified characters/);
  assert.match(chinese, /for a sentence, exactly one \{ "text"/);
  assert.match(parentInstructions('german', []), /"facets" as an empty object/);
  assert.match(chinese, /one \{ "text": "<the Chinese word or words of that meaning>", "pinyin": "<their pinyin with tone marks>" \} per meaning/);
  assert.match(chinese, /without Markdown, numbering or headings/);

  const schema = parentSchema('german', ['article', 'examples']);
  assert.deepEqual(Object.keys(schema.properties), ['core', 'facets']);
  assert.deepEqual(schema.properties.core.required, ['kind', 'language', 'key', 'meanings']);
  assert.deepEqual(Object.keys(schema.properties.core.properties), ['kind', 'language', 'key', 'romanization', 'gramRole', 'meanings'], 'the flags come first');
  assert.deepEqual(Object.keys(schema.properties.facets.properties), ['article', 'examples']);
  assert.deepEqual(schema.properties.facets.required, [], 'every facet may be left out');
  assert.deepEqual(parentSchema('chinese', ['pinyin']).properties.core.required, ['kind', 'language', 'key', 'meanings']);

  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    const [system, user] = JSON.parse(options.body).messages;
    assert.match(system.content, /"examples"/);
    assert.match(system.content, /Match this JSON schema: \{"type":"object"/);
    assert.deepEqual(JSON.parse(user.content), { selectedText: 'bank', instanceId: 'g' });
    return Response.json(completion(JSON.stringify(wordResult('Ufer'))));
  } });
  assert.deepEqual(await provider.generate({ module: { id: 'g', type: 'german', facets: ['examples'] }, selectedText: 'bank',
    facets: ['examples'] }), wordResult('Ufer'));
});

test('a facet’s own Retry regenerates that facet’s markdown for the core already there, keeps the rest and the card’s reading, and keeps everything when it fails', async (t) => {
  const requests = [];
  let failing = false;
  const steep = [{ sentence: 'The bank was steep.', translation: 'Das Ufer war steil.' }];
  const { store, generation, capture } = await parentFixture(t, {
    generate: async request => {
      requests.push(request);
      if (failing) throw new Error('provider down');
      if (!request.core) return BANK;
      // A core written again is not taken; nor is another facet's entry.
      return { facets: request.facets[0] === 'examples' ? { examples: steep, synonyms: ['ignored'] } : { synonyms: ['Böschung'] } };
    }
  });
  const page = await capture('bank'); await finish(store, generation);
  const german = async () => generated(await store.page(page.id))[0];
  const stored = async () => (await german()).content.blocks[0];
  const retryFacet = async (facet, confirm = true) => {
    const payload = { pageId: page.id, target: { scope: 'facet', componentId: (await german()).id, facet }, session };
    const result = confirm ? await confirmed(store, randomUUID(), payload) : await store.generate(randomUUID(), payload);
    await generation.start(page.id, result.attemptIds);
    return result;
  };

  // A facet with content asks first; the content stays while it regenerates.
  await assert.rejects(store.generate(randomUUID(), { pageId: page.id, target: { scope: 'facet', componentId: (await german()).id, facet: 'examples' }, session }),
    { code: 'confirmation_required' });
  const { attemptIds } = await confirmed(store, randomUUID(), { pageId: page.id, target: { scope: 'facet', componentId: (await german()).id, facet: 'examples' }, session });
  let current = await german();
  assert.deepEqual(current.content.blocks[0], { type: 'parent', ...keyed(BANK) });
  assert.equal(current.status, 'loading');
  assert.equal(current.retryingFacet, 'examples');
  await generation.start(page.id, attemptIds); await finish(store, generation);
  assert.deepEqual(requests.at(-1).core, BANK.core, 'the provider writes for the core already there, its flags included');
  assert.deepEqual(requests.at(-1).facets, ['examples']);
  assert.equal(requests.length, 2, 'the card’s reading of the main key is kept: no request reads it again');
  const formatted = keyed(BANK);
  assert.deepEqual(await stored(), { type: 'parent', ...formatted, facets: { article: formatted.facets.article, examples: '1. The ==bank== was steep.\n   *Das Ufer war steil.*' } },
    'only the facet’s markdown changes, formatted from its JSON');
  current = await german();
  assert.equal(current.status, 'completed');
  assert.equal(current.retryingFacet, undefined);

  // A facet without an entry starts at once and gains one.
  await retryFacet('synonyms', false); await finish(store, generation);
  assert.equal((await stored()).facets.synonyms, 'Böschung');

  // A failed facet Retry keeps the content, and a waiting facet still waits.
  await store.deleteFacet(randomUUID(), { pageId: page.id, componentId: current.id, parent: 'german', facet: 'antonyms' });
  await store.addFacet(randomUUID(), { pageId: page.id, componentId: current.id, parent: 'german', facet: 'antonyms' });
  const before = await stored();
  failing = true;
  await retryFacet('antonyms', false); await finish(store, generation);
  current = await german();
  assert.deepEqual(await stored(), before);
  assert.equal(current.status, 'completed');
  assert.equal(current.failedFacet, 'antonyms');
  assert.deepEqual(current.waitingFacets, ['antonyms']);

  // A parent without structured content yet is retried whole.
  const { componentId } = await store.addModule(randomUUID(), { pageId: page.id, type: 'german' });
  await store.addFacet(randomUUID(), { pageId: page.id, componentId, parent: 'german', facet: 'examples' });
  await assert.rejects(store.generate(randomUUID(), { pageId: page.id, target: { scope: 'facet', componentId, facet: 'examples' }, session }),
    { code: 'invalid', message: /Retry the whole module first/ });
});

test('OpenCode asks a facet’s own Retry for its facets only, written for the supplied core', async () => {
  const instructions = parentInstructions('german', ['examples'], true);
  assert.match(instructions, /already written and supplied as "core". Return only "facets"/);
  assert.doesNotMatch(instructions, /"kind": "<word/);
  assert.deepEqual(Object.keys(parentSchema('german', ['examples'], true).properties), ['facets']);
  const core = { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer'] };
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    const [, user] = JSON.parse(options.body).messages;
    assert.deepEqual(JSON.parse(user.content), { selectedText: 'bank', core, instanceId: 'g' });
    return Response.json(completion(JSON.stringify({ facets: { examples: [{ sentence: 'A bank.' }] } })));
  } });
  assert.deepEqual(await provider.generate({ module: { id: 'g', type: 'german', facets: ['examples'] }, selectedText: 'bank',
    facets: ['examples'], core }), { facets: { examples: [{ sentence: 'A bank.' }] } });
});

test('each generated part records its model and prompt version; a facet’s own Retry records only that facet, and saves keep the record (D11)', async (t) => {
  let failing = false;
  const provider = {
    model: 'pinned-model',
    generate: async request => {
      if (failing) throw new Error('provider down');
      return request.core ? { facets: { examples: [{ sentence: 'The bank was steep.', translation: 'Das Ufer war steil.' }] } } : BANK;
    }
  };
  const { store, generation, capture } = await parentFixture(t, provider, ['article', 'examples', 'synonyms']);
  const page = await capture('bank'); await finish(store, generation);
  const german = async () => generated(await store.page(page.id))[0];
  const record = async () => (await store.generationRecords(page.id))[(await german()).id];
  const whole = promptVersion({ instructions: parentInstructions('german', ['article', 'examples', 'synonyms']),
    schema: parentSchema('german', ['article', 'examples', 'synonyms']) });
  const entry = { model: 'pinned-model', prompt: whole };
  // Synonyms came back empty: it has no content, so nothing records it.
  assert.deepEqual(await record(), { core: entry, article: entry, examples: entry });

  const retry = promptVersion({ instructions: parentInstructions('german', ['examples'], true),
    schema: parentSchema('german', ['examples'], true) });
  assert.notEqual(retry, whole);
  const { attemptIds } = await confirmed(store, randomUUID(), { pageId: page.id, target: { scope: 'facet', componentId: (await german()).id, facet: 'examples' }, session });
  await generation.start(page.id, attemptIds); await finish(store, generation);
  assert.deepEqual(await record(), { core: entry, article: entry, examples: { model: 'pinned-model', prompt: retry } }, 'only the retried facet changes');

  // A user's edits, whole or of one facet, never change the record.
  const block = (await german()).content.blocks[0];
  await store.savePage(randomUUID(), { pageId: page.id, changes: [{ componentId: (await german()).id, content: { version: 1, blocks: [{ ...block, core: 'mein Ufer' }] } }] });
  await store.savePage(randomUUID(), { pageId: page.id, changes: [{ componentId: (await german()).id, facet: 'article',
    content: { version: 1, blocks: [{ ...block, facets: { ...block.facets, article: 'das Bankufer' } }] } }] });
  assert.equal((await german()).content.blocks[0].core, 'mein Ufer');
  assert.deepEqual(await record(), { core: entry, article: entry, examples: { model: 'pinned-model', prompt: retry } });

  // A whole Retry that fails leaves no content, and no record.
  failing = true;
  await generation.start(page.id, (await retryComponent(store, randomUUID(), await store.page(page.id), 0)).attemptIds); await finish(store, generation);
  assert.equal((await german()).status, 'failed');
  assert.equal(await record(), undefined);
});

test('provider events carry the prompt version of the request they send (D11)', async () => {
  const events = [];
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'stop',
    message: { role: 'assistant', content: JSON.stringify(BANK) } }] }) });
  provider.diagnostic = event => events.push(event);
  const facets = ['article', 'examples'];
  await provider.generate({ module: { id: 'g', type: 'german' }, selectedText: 'bank', facets });
  const expected = promptVersion({ instructions: parentInstructions('german', facets), schema: parentSchema('german', facets) });
  assert.deepEqual(events.map(event => [event.event, event.promptVersion]), [['provider.request', expected], ['provider.response', expected]]);
});

test('an Expertise module explains in the account’s language, and its prompt version records which (D14, K36)', async (t) => {
  const requests = [];
  const { store, generation, capture } = await fixture(t, {
    generate: async request => { requests.push(request); return { core: { relevance: 'subject', key: request.selectedText, explanation: ['La partie visible.'] }, facets: {} }; }
  }, ['computer-science']);
  await store.setLanguage('to-french', 'fr');
  const page = await capture('Frontend'); await finish(store, generation);
  const card = generated(await store.page(page.id))[0];
  assert.equal(card.status, 'completed');
  assert.equal(requests[0].language, 'fr', 'the provider is asked in French');
  const french = promptVersion({ instructions: parentInstructions('computer-science', [], false, 'fr'), schema: parentSchema('computer-science', []) });
  assert.equal((await store.generationRecords(page.id))[card.id].core.prompt, french);
  assert.notEqual(french, promptVersion({ instructions: parentInstructions('computer-science', []), schema: parentSchema('computer-science', []) }));
});

test('the request OpenCode sends for an Expertise module in Chinese carries the Chinese writing guide and a length in characters (D15)', async () => {
  const bodies = [];
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ core: { relevance: 'subject', key: 'cache', explanation: ['缓存（cache）是……'] }, facets: {} }) } }] });
  } });
  await provider.generate({ module: { id: 'cs', type: 'computer-science' }, selectedText: 'cache', facets: [], language: 'zh-Hans' });
  const system = bodies[0].messages.find(message => message.role === 'system').content;
  assert.match(system, /at most about 80 Chinese characters each/);
  assert.match(system, /哈希表（hash table）/);
  assert.doesNotMatch(system, /at most 50 words|\{\{/);
  await provider.generate({ module: { id: 'g', type: 'german' }, selectedText: 'bank', facets: ['article'], language: 'zh-Hans' }).catch(() => {});
  assert.doesNotMatch(bodies[1].messages.find(message => message.role === 'system').content, /哈希表/, 'a Languages module gets no guide');
});

test('an Expertise module explains the key in English as one core with its case, its top line the key only (D11, D17)', async (t) => {
  const requests = [];
  const { store, generation, capture } = await fixture(t, {
    model: 'pinned-model',
    generate: async request => {
      requests.push(request);
      return request.selectedText.endsWith('.')
        ? { core: { relevance: 'subject', key: request.selectedText, explanation: ['A page asks a server for data.'] }, facets: {} }
        : { core: { relevance: 'subject', key: request.selectedText, explanation: ['The part of a program people see.', 'Like a dining room.'] }, facets: {} };
    }
  }, ['computer-science']);
  const page = await capture('Frontend'); await finish(store, generation);
  const card = generated(await store.page(page.id))[0];
  assert.equal(card.status, 'completed');
  assert.deepEqual(card.content.blocks[0], { type: 'parent', header: { kind: 'expertise', key: 'Frontend', relevance: 'subject' },
    core: 'The part of a program people see.\n\nLike a dining room.', facets: {} });
  assert.deepEqual(requests[0].facets, [], 'a provisional core only');
  const prompt = promptVersion({ instructions: parentInstructions('computer-science', []), schema: parentSchema('computer-science', []) });
  assert.deepEqual((await store.generationRecords(page.id))[card.id], { core: { model: 'pinned-model', prompt } });
  assert.match(parentInstructions('computer-science', []), /as computer science understands it/);
  assert.match(parentInstructions('mathematics', []), /Write every part in English/);
  assert.match(parentInstructions('mathematics', []), /"relevance": "<subject \| neighbouring \| unrelated>"/);

  const said = await capture('The frontend sends a request.'); await finish(store, generation);
  assert.deepEqual(generated(await store.page(said.id))[0].content.blocks[0], { type: 'parent',
    header: { kind: 'expertise', key: 'The frontend sends a request.', relevance: 'subject' }, core: 'A page asks a server for data.', facets: {} });
});
