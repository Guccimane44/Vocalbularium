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
import { plainLines } from '@vocabularium/domain/markdown';
import { isContentType } from '@vocabularium/domain/page-modules';
import { confirmed, generated, resultFor, sentenceResult, text, textBlocks, useModules, wordResult, staged } from './helpers/pages.mjs';

import { GERMAN_WORD_PROMPT, session, modules, fixture, finish, retryComponent } from './helpers/generation.mjs';

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
