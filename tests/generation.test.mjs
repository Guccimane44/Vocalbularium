import test, { createTestStore, createTestApplication } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Generation } from '../src/server/generation.mjs';
import { OpenCodeProvider, parentInstructions, parentSchema } from '../src/server/opencode.mjs';
import { generateComponents } from '@vocabularium/domain/modules';
import { isContentType } from '@vocabularium/domain/page-modules';
import { confirmed, generated, resultFor, sentenceResult, text, textBlocks, useModules, wordResult } from './helpers/pages.mjs';

const session = { installationId: 'test-installation', sessionId: 'test-browser', epoch: 1 };
const word = { inputType: 'word_phrase' };
const sentence = { inputType: 'sentence' };
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
    interpret: (_text, signal) => {
      calls++;
      if (calls > 1) return Promise.resolve(word);
      return new Promise((resolve, reject) => {
        releaseFirst = resolve; firstStarted();
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    },
    generate: async request => resultFor(request, 'generated text')
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
  releaseFirst(word);
  await settled;
  assert.equal(calls, 2, 'only admitted captures contacted the provider');
  assert.equal((await store.page(first.id)).status, 'loading', 'publication remains explicit');
  await finish(store, generation);
  assert.equal((await store.page(second.id)).status, 'completed');
});

test('a busy confirmed Retry returns 429 and preserves component content and attempt identity', async t => {
  let release, started;
  let interpretations = 0;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const application = await createTestApplication(t, {
    generationOptions: { maxActive: 1, maxQueued: 0 },
    provider: {
      interpret: (_text, signal) => ++interpretations > 1 ? Promise.resolve(word) : new Promise((resolve, reject) => {
        release = resolve; started();
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
      generate: async request => resultFor(request, 'generated text')
    }
  });
  t.after(() => application.close());
  const { store, generation } = application;
  await useModules(store, ['chinese']);
  await store.openSession('open', session);
  const snapshot = await store.snapshot();
  const targetId = (await store.capture('target', { session, mainKey: 'target', snapshot })).pageId;
  const target = generated(await store.page(targetId))[0];
  await store.failAttempt(target.attemptId);
  await store.savePage('manual-edit', { pageId: targetId, changes: [{ componentId: target.id, content: textBlocks('preserve me') }] });
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
  assert.equal(after.status, 'failed');
  release(word);
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
  const { generation, capture } = await fixture(t, { interpret: pending, generate: async request => resultFor(request, 'x') }, ['chinese'], { maxActive: 1, maxQueued: 2 });
  await capture();
  assert.equal(generation.occupied(), 1);
  assert.equal(generation.reserve(3), null);
  const reservation = generation.reserve(2);
  assert.ok(reservation);
  assert.equal(generation.reserve(1), null);
  generation.release(reservation);
  assert.ok(generation.reserve(2));
});

test('session invalidation aborts active interpretation and removes queued work', async t => {
  const store = await createTestStore(t);
  await useModules(store, ['chinese']);
  await store.openSession('open', session);
  let started, aborted = 0, calls = 0;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const generation = await Generation.create(store, {
    interpret: (_text, signal) => {
      calls++;
      started();
      return new Promise((_, reject) => signal.addEventListener('abort', () => {
        aborted++; reject(signal.reason);
      }, { once: true }));
    }, generate: async () => assert.fail('obsolete attempt generated content')
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

test('an obsolete interpretation is canceled even when the same page has a new-session retry', async t => {
  const signals = [], releases = [], started = [];
  const firstStarted = new Promise(resolve => { started[0] = resolve; });
  const secondStarted = new Promise(resolve => { started[1] = resolve; });
  const { store, generation, capture } = await fixture(t, {
    interpret: (_text, signal) => {
      const index = signals.push(signal) - 1;
      return new Promise((resolve, reject) => {
        releases[index] = resolve; started[index]();
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }, generate: async request => resultFor(request, 'generated text')
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
  releases[1](word);
  await Promise.all([...generation.tasks.values()].map(item => item.task));
});

test('diagnostic failures cannot turn an admitted saved capture into a failed request', async t => {
  const { store, generation, capture } = await fixture(t, { interpret: async () => word, generate: async request => resultFor(request, 'text') }, undefined,
    { diagnostic: () => { throw new Error('logger unavailable'); } });
  const page = await capture('word');
  await finish(store, generation);
  assert.equal((await store.page(page.id)).status, 'completed');
});

test('modules receive the exact main key and keep literal markers', async () => {
  const input = '  幸福\n';
  const received = [];
  const outcomes = await generateComponents({
    mainKey: input, modules: modules('chinese', 'chinese'), interpretation: word,
    generate: async request => { received.push(request.selectedText); return resultFor(request, '<b>幸福</b> & 快乐'); }
  });
  assert.deepEqual(outcomes.map(item => item.content.core.meanings[0]), ['<b>幸福</b> & 快乐', '<b>幸福</b> & 快乐']);
  assert.deepEqual(received, [input, input]);
});

test('one shared interpretation per run; components fail independently', async (t) => {
  let interpretations = 0;
  const { store, generation, capture } = await fixture(t, {
    interpret: async () => { interpretations++; return word; },
    generate: async request => { if (request.module.type === 'german') throw Error('controlled failure'); return resultFor(request, 'explanation'); }
  }, ['chinese', 'german', 'chinese']);
  const page = await capture();
  assert.equal((await store.page(page.id)).status, 'loading');
  await finish(store, generation);
  assert.equal(interpretations, 1);
  assert.equal((await store.page(page.id)).status, 'failed');
  assert.deepEqual(await outcome(store, page), [['explanation', 'completed'], ['', 'failed'], ['explanation', 'completed']]);
  assert.deepEqual((await store.run((await store.attempt(generated(page)[0].attemptId)).run_id)).interpretation, word);
});

test('interpretation failure fails every component without a module call', async (t) => {
  const { store, generation, capture } = await fixture(t, { interpret: async () => { throw Error('unavailable'); }, generate: async () => assert.fail('module ran') }, ['chinese', 'chinese']);
  const page = await capture(); await finish(store, generation);
  assert.deepEqual((await outcome(store, page)).map(([, status]) => status), ['failed', 'failed']);
});

test('repeated modules generate independently, even when they produce the same text', async (t) => {
  let calls = 0;
  const { store, generation, capture } = await fixture(t, { interpret: async () => sentence, generate: async request => { calls++; return resultFor(request, 'same example'); } }, ['chinese', 'chinese']);
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
const BANK = wordResult(['Ufer'], { article: { singular: 'das Ufer', plural: 'die Ufer' },
  examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }] }, { key: 'bank' });
const data = async (store, page) => (await store.page(page.id)).components.filter(item => item.moduleType === 'german').map(item => item.content.blocks[0]);

test('a parent generates its core and the facets that apply to the input, in one call, as structured content (D09)', async (t) => {
  const requests = [];
  const { store, generation, capture } = await parentFixture(t, {
    interpret: async text => text.includes(' ') ? sentence : word,
    generate: async request => { requests.push(request); return request.interpretation.inputType === 'sentence'
      ? sentenceResult('Wir saßen am Ufer.', { examples: [{ sentence: 'We stood by the river.', translation: 'Wir standen am Fluss.' }] }) : BANK; }
  });
  const wordPage = await capture('bank'); await finish(store, generation);
  const sentencePage = await capture('We sat on the bank.'); await finish(store, generation);
  assert.deepEqual(requests.map(request => [request.module.type, request.facets]),
    [['german', ['article', 'examples', 'synonyms', 'antonyms']], ['german', ['examples']]]);
  assert.deepEqual(await data(store, wordPage), [{ type: 'parent', ...BANK }], 'stored as one parent block; a facet left out, like Synonyms, has no entry');
  assert.equal((await outcome(store, sentencePage))[0][1], 'completed', 'a parent never completes empty for a sentence');
  assert.equal((await store.page(sentencePage.id)).interpretation, 'sentence');
});

test('a parent drops entries of facets it does not have, and fails on a result outside its shape', async (t) => {
  const replies = [{ ...BANK, facets: { ...BANK.facets, antonyms: ['Strom'] } }, { text: '== Englisch ==\n: [1] Ufer' }, sentenceResult('a sentence core for a word'),
    wordResult(['Ufer'], { examples: [{ translation: 'only a translation' }] })];
  const { store, generation, capture } = await parentFixture(t, { interpret: async () => word, generate: async () => replies.shift() }, ['article', 'examples']);
  const kept = await capture('bank'); await finish(store, generation);
  assert.deepEqual(await data(store, kept), [{ type: 'parent', ...BANK }]);
  for (let index = 0; index < 3; index++) {
    const wrong = await capture('bank'); await finish(store, generation);
    assert.deepEqual(await outcome(store, wrong), [['', 'failed']], `refused reply ${index + 2}`);
  }
});

test('a provider resolving after abort cannot stage output from an interrupted browser session', async (t) => {
  let release, started, signal;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const { store, generation, capture } = await fixture(t, { interpret: (_text, providerSignal) => new Promise(resolve => {
    signal = providerSignal; release = resolve; started();
  }), generate: async request => resultFor(request, 'late') });
  const page = await capture();
  await providerStarted;
  const old = generated(page)[0];
  const nextSession = { ...session, sessionId: 'new-browser', epoch: 2 };
  await store.openSession('reopen', nextSession);
  await retryComponent(store, 'retry', await store.page(page.id), 0, nextSession);
  await generation.cancelObsolete();
  assert.equal(signal.aborted, true);
  release(word);
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  assert.equal((await store.run((await store.attempt(old.attemptId)).run_id)).interpretation, null);
  assert.equal(generated(await store.page(page.id))[0].status, 'loading');
  assert.equal((await store.attempt(old.attemptId)).result, null);
  assert.equal(generation.pendingResults.has(old.attemptId), false);
});

test('a late module response after cancellation is discarded before result staging', async t => {
  let release, started, providerSignal;
  const providerStarted = new Promise(resolve => { started = resolve; });
  const { store, generation, capture } = await fixture(t, {
    interpret: async () => word,
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

test('OpenCode uses the Go endpoint, selected DeepSeek model, and only selection data', async () => {
  let body;
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', fetchImpl: async (url, options) => {
      assert.equal(url, 'https://opencode.ai/zen/go/v1/chat/completions'); body = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer test-only');
      assert.equal(options.headers['User-Agent'], 'Vocabularium/0.7.3');
      assert.equal(options.headers['x-opencode-session'], 'capture-conversation');
      assert.equal(options.method, 'POST'); assert.ok(options.signal instanceof AbortSignal);
      return Response.json(completion(JSON.stringify(word)));
    }
  });
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
    ...[null, [], {}, { ...word, inputType: 'paragraph' }, { inputType: '' },
      { ...word, sourceLanguage: 'Chinese' }, { ...word, unexpected: true }]
      .map(value => completion(JSON.stringify(value)))
  ]) {
    provider.fetch = async () => Response.json(result);
    await assert.rejects(provider.interpret('幸福'));
  }
  provider.fetch = async () => new Response('<html>Gateway unavailable</html>');
  await assert.rejects(provider.interpret('幸福'), /invalid result/);
});

test('OpenCode passes module context and returns the structured result; rejects a result without its parts or with extra fields', async () => {
  const input = { module: { id: 'example-2', type: 'german' }, selectedText: '幸福', interpretation: word, facets: ['examples'] };
  const output = { core: { kind: 'word', language: 'Chinesisch', key: '幸福', romanization: 'xìngfú', meanings: ['Glück'] },
    facets: { examples: [{ sentence: '幸福就在身边。', translation: 'Das Glück ist ganz nah.' }] } };
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', model: 'configured-model', fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'configured-model');
      assert.deepEqual(JSON.parse(body.messages[1].content), { selectedText: input.selectedText, inputType: 'word_phrase', instanceId: 'example-2' });
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
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })
  });
  const pending = provider.interpret('幸福', controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('Go requests share a stable conversation per page; each retry interprets again', async (t) => {
  const sessions = [];
  const provider = new OpenCodeProvider({
    apiKey: 'test-only', fetchImpl: async (_, options) => {
      sessions.push(options.headers['x-opencode-session']);
      const input = JSON.parse(JSON.parse(options.body).messages[1].content);
      return Response.json(completion(JSON.stringify(input.interpretation ? { text: 'Chinese' } : word)));
    }
  });
  const { store, generation, capture } = await fixture(t, provider);
  const first = await capture(); await finish(store, generation);
  assert.deepEqual(sessions, [first.id, first.id]);
  const { attemptIds } = await retryComponent(store, 'retry-go', await store.page(first.id), 0);
  await generation.start(first.id, attemptIds); await finish(store, generation);
  assert.deepEqual(sessions, Array(4).fill(first.id));
  const second = await capture(); await finish(store, generation);
  assert.deepEqual(sessions.slice(4), [second.id, second.id]);
  assert.notEqual(first.id, second.id);
});

test('generation passes the saved Context to interpretation and modules', async (t) => {
  const seen = [];
  const { store, generation } = await fixture(t, {
    interpret: async (mainKey, _signal, _session, context) => { seen.push(['interpret', mainKey, context]); return word; },
    generate: async request => { seen.push(['generate', request.selectedText, request.context]); return resultFor(request, 'explained'); }
  }, ['context', 'chinese']);
  const { pageId } = await store.capture('with-context', { session, mainKey: 'Bismarck', context: 'Otto von Bismarck, chancellor', snapshot: await store.snapshot() });
  await generation.start(pageId); await finish(store, generation);
  assert.deepEqual(seen, [['interpret', 'Bismarck', 'Otto von Bismarck, chancellor'], ['generate', 'Bismarck', 'Otto von Bismarck, chancellor']]);
});

test('authenticated capture saves before generation, repeats safely, and publishes only from its origin', async (t) => {
  let release;
  const application = await createTestApplication(t, { provider: { interpret: () => new Promise(resolve => { release = resolve; }), generate: async request => resultFor(request, 'Glück') } });
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
  release(word);
  await Promise.all([...application.generation.tasks.values()].map(item => item.task));
  const polled = await post('/api/poll', { session }); assert.equal(polled.body.ready.length, payload.snapshot.modules.filter(module => isContentType(module.type)).length);
  for (const attemptId of polled.body.ready) assert.equal((await post('/api/publish', { operationId: `publish-${attemptId}`, payload: { attemptId, session } })).status, 200);
  assert.equal((await application.store.page(captured.body.pageId)).status, 'completed');
  assert.equal((await post('/api/capture', { operationId: 'invalid', payload: {} })).status, 400);
});

test('a failed result write retains the complete generated output for explicit save recovery without a new model call', async (t) => {
  let calls = 0;
  const { store, generation, capture } = await fixture(t, { interpret: async () => word, generate: async request => { calls++; return resultFor(request, 'complete generated text'); } });
  const stage = store.stage.bind(store);
  let failWrite = true;
  store.stage = (id, result) => { if (failWrite && result.content?.core.meanings[0] === 'complete generated text') throw Error('controlled disk write failure'); return stage(id, result); };
  const page = await capture();
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  const back = generated(page)[0];
  assert.equal(generated(await store.page(page.id))[0].status, 'loading');
  assert.deepEqual(generation.pendingResults.get(back.attemptId), { ok: true, content: wordResult('complete generated text', {}, { key: '幸福' }) });
  assert.equal(generation.failedResults.has(back.attemptId), true);
  failWrite = false;
  await generation.saveResult(back.attemptId, session);
  assert.equal(generation.failedResults.has(back.attemptId), false);
  await store.publish('recover-output', { attemptId: back.attemptId, session });
  assert.equal(text(generated(await store.page(page.id))[0]), 'complete generated text'); assert.equal(calls, 1);
});

test('an in-progress result write does not advertise save recovery', async t => {
  const { store, generation, capture } = await fixture(t, {
    interpret: async () => word, generate: async request => resultFor(request, 'staged later')
  });
  const stage = store.stage.bind(store);
  let releaseStage, signalStage;
  const started = new Promise(resolve => { signalStage = resolve; });
  store.stage = async (id, result) => {
    if (result.content?.core.meanings[0] === 'staged later') {
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
  assert.deepEqual((await store.attempt(attemptId)).result, { ok: true, content: wordResult('staged later', {}, { key: '幸福' }) });
});

test('the result recovery journal survives a failed database write and server restart without regenerating', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-result-journal-'));
  const databaseKey = join(directory, 'account-fixture');
  let store = await createTestStore(t, databaseKey), calls = 0;
  let generation = await Generation.create(store, { interpret: async () => word, generate: async request => { calls++; return resultFor(request, 'journaled result'); } });
  t.after(async () => { await generation.close(); await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.openSession('open', session);
  const { pageId } = await store.capture('capture', { session, mainKey: '幸福', snapshot: (await store.snapshot()) });
  const originalStage = store.stage.bind(store);
  store.stage = (id, result) => { if (result.content?.core.meanings[0] === 'journaled result') throw Error('database temporarily unavailable'); return originalStage(id, result); };
  await generation.start(pageId);
  await Promise.all([...generation.tasks.values()].map(item => item.task));
  const { attemptId } = generated(await store.page(pageId))[0];
  assert.ok(generation.pendingResults.has(attemptId));
  await generation.close();
  await store.close();
  store = (await createTestStore(t, databaseKey)); generation = (await Generation.create(store, { interpret: async () => assert.fail(), generate: async () => assert.fail() }));
  assert.deepEqual((await store.attempt(attemptId)).result, { ok: true, content: wordResult('journaled result', {}, { key: '幸福' }) });
  await store.publish('recovered', { attemptId, session });
  assert.equal(text(generated(await store.page(pageId))[0]), 'journaled result'); assert.equal(calls, 1);
});

test('OpenCode asks a parent for its core and the facets asked for as JSON, without markup (D09)', async () => {
  const word = parentInstructions('german', 'word_phrase', ['article', 'synonyms']);
  assert.match(word, /"kind": "word"/);
  assert.ok(word.indexOf('"article"') < word.indexOf('"synonyms"'));
  assert.doesNotMatch(word, /"examples"|"antonyms"|===|\[1\]/);
  const sentence = parentInstructions('chinese', 'sentence', ['examples', 'pinyin']);
  assert.match(sentence, /"kind": "sentence", "translation"/);
  assert.match(sentence, /simplified characters/);
  assert.match(sentence, /"pinyin": exactly one/);
  assert.match(parentInstructions('german', 'sentence', []), /"facets" as an empty object/);
  const chinese = parentInstructions('chinese', 'word_phrase', ['examples', 'pinyin']);
  assert.match(chinese, /one \{ "text": "<the Chinese word or words of that meaning>", "pinyin": "<their pinyin with tone marks>" \} per meaning/);
  assert.match(chinese, /without Markdown, numbering or headings/);

  const schema = parentSchema('german', 'word_phrase', ['article', 'examples']);
  assert.deepEqual(Object.keys(schema.properties), ['core', 'facets']);
  assert.deepEqual(schema.properties.core.required, ['kind', 'language', 'key', 'meanings']);
  assert.deepEqual(Object.keys(schema.properties.facets.properties), ['article', 'examples']);
  assert.deepEqual(schema.properties.facets.required, [], 'every facet may be left out');
  assert.deepEqual(parentSchema('chinese', 'sentence', ['pinyin']).properties.core.required, ['kind', 'translation']);

  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    const [system, user] = JSON.parse(options.body).messages;
    assert.match(system.content, /"examples"/);
    assert.match(system.content, /Match this JSON schema: \{"type":"object"/);
    assert.deepEqual(JSON.parse(user.content), { selectedText: 'bank', inputType: 'word_phrase', instanceId: 'g' });
    return Response.json(completion(JSON.stringify(wordResult('Ufer'))));
  } });
  assert.deepEqual(await provider.generate({ module: { id: 'g', type: 'german', facets: ['examples'] }, selectedText: 'bank',
    interpretation: { inputType: 'word_phrase' }, facets: ['examples'] }), wordResult('Ufer'));
});

test('a facet’s own Retry regenerates that facet’s entry for the core already there, keeps the rest and the page’s reading, and keeps everything when it fails', async (t) => {
  const requests = [];
  let interpretations = 0, failing = false;
  const steep = [{ sentence: 'The bank was steep.', translation: 'Das Ufer war steil.' }];
  const { store, generation, capture } = await parentFixture(t, {
    interpret: async () => { interpretations++; return word; },
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
  assert.deepEqual(current.content.blocks[0], { type: 'parent', ...BANK });
  assert.equal(current.status, 'loading');
  assert.equal(current.retryingFacet, 'examples');
  await generation.start(page.id, attemptIds); await finish(store, generation);
  assert.deepEqual(requests.at(-1).core, BANK.core, 'the provider writes for the core already there');
  assert.deepEqual(requests.at(-1).facets, ['examples']);
  assert.equal(interpretations, 1, 'the page’s reading of the main key is kept');
  assert.deepEqual(await stored(), { type: 'parent', core: BANK.core, facets: { article: BANK.facets.article, examples: steep } }, 'only the facet’s entry changes');
  current = await german();
  assert.equal(current.status, 'completed');
  assert.equal(current.retryingFacet, undefined);

  // A facet without an entry starts at once and gains one.
  await retryFacet('synonyms', false); await finish(store, generation);
  assert.deepEqual((await stored()).facets.synonyms, ['Böschung']);

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

  // A component without structured content is retried whole.
  await store.savePage(randomUUID(), { pageId: page.id, changes: [{ componentId: current.id, content: textBlocks('My own notes') }] });
  await assert.rejects(store.generate(randomUUID(), { pageId: page.id, target: { scope: 'facet', componentId: current.id, facet: 'examples' }, session }),
    { code: 'invalid', message: /Retry the whole module first/ });
});

test('OpenCode asks a facet’s own Retry for its facets only, written for the supplied core', async () => {
  const instructions = parentInstructions('german', 'word_phrase', ['examples'], true);
  assert.match(instructions, /already written and supplied as "core". Return only "facets"/);
  assert.doesNotMatch(instructions, /"kind": "word"/);
  assert.deepEqual(Object.keys(parentSchema('german', 'word_phrase', ['examples'], true).properties), ['facets']);
  const core = { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer'] };
  const provider = new OpenCodeProvider({ apiKey: 'test-only', fetchImpl: async (_, options) => {
    const [, user] = JSON.parse(options.body).messages;
    assert.deepEqual(JSON.parse(user.content), { selectedText: 'bank', core, inputType: 'word_phrase', instanceId: 'g' });
    return Response.json(completion(JSON.stringify({ facets: { examples: [{ sentence: 'A bank.' }] } })));
  } });
  assert.deepEqual(await provider.generate({ module: { id: 'g', type: 'german', facets: ['examples'] }, selectedText: 'bank',
    interpretation: { inputType: 'word_phrase' }, facets: ['examples'], core }), { facets: { examples: [{ sentence: 'A bank.' }] } });
});
