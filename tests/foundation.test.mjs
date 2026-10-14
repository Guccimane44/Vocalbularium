import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture as captureWith, code, complete, component, confirmed, generated, text, textBlocks, useModules } from './helpers/pages.mjs';

const a = { installationId: 'a', sessionId: 'a-1', epoch: 1 };
const b = { installationId: 'b', sessionId: 'b-1', epoch: 1 };
async function fixture(t, databaseKey) {
  const store = await createTestStore(t, databaseKey);
  t.after(async () => (await store.close()));
  await store.openSession('open-a', a);
  await store.openSession('open-b', b);
  await useModules(store, ['context', 'chinese', 'german']);
  return store;
}
const capture = (store, id = 'capture', session = a, mainKey) => captureWith(store, id, session, mainKey);

test('account initialization is persistent, occurs once, and starts with the main key, Context and a Chinese module', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'vocabularium-db-'));
  let reopened;
  t.after(async () => {
    await reopened?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const databaseKey = join(directory, 'account-fixture');
  const first = await createTestStore(t, databaseKey);
  await first.openSession('open-a', a);
  const initial = await first.snapshot();
  assert.deepEqual(initial.modules.map(module => module.type), ['main-key', 'context', 'german']);
  const { pageId } = await capture(first);
  await first.close();
  reopened = (await createTestStore(t, databaseKey));
  assert.deepEqual((await reopened.snapshot()), initial);
  assert.equal((await reopened.pages()).length, 1);
  const page = await reopened.page(pageId);
  assert.equal(page.selectedText, '  幸福\n');
  assert.equal(text(component(page, 'main-key')), '  幸福\n');
});

test('uncertain capture resubmission preserves identity; separate identical captures remain separate', async (t) => {
  const store = await fixture(t);
  const first = await capture(store);
  const replay = await store.capture('capture', first.payload);
  const second = await capture(store, 'capture-2');
  assert.equal(replay.pageId, first.pageId);
  assert.equal(replay.sequence, first.sequence);
  assert.equal(replay.replayed, true);
  assert.notEqual(second.pageId, first.pageId);
  assert.equal((await store.pages()).length, 2);
  await assert.rejects(async () => (await store.capture('capture', { ...first.payload, mainKey: 'other' })), code('operation_reused'));
});

test('capture saves the main key and Context and starts one attempt per content module', async (t) => {
  const store = await fixture(t);
  const { page } = await captureWith(store, 'with-context', a, 'Bismarck', 'Otto von Bismarck was chancellor.');
  assert.deepEqual(page.components.map(item => item.moduleType), ['main-key', 'context', 'chinese', 'german']);
  assert.equal(text(component(page, 'context')), 'Otto von Bismarck was chancellor.');
  assert.ok(generated(page).every(item => item.status === 'loading' && item.attemptId));
  assert.equal(new Set(await Promise.all(generated(page).map(async item => (await store.attempt(item.attemptId)).run_id))).size, 1);
  assert.equal(page.status, 'loading');
});

test('server stage cannot publish; another installation cannot publish its result', async (t) => {
  const store = await fixture(t);
  const { pageId, page } = await capture(store);
  const { attemptId } = generated(page)[0];
  await store.stage(attemptId, { ok: true, text: 'generated' });
  assert.equal(text(generated(await store.page(pageId))[0]), '');
  assert.equal((await store.page(pageId)).status, 'loading');
  await assert.rejects(async () => (await store.publish('wrong', { attemptId, session: b })), code('wrong_session'));
  await store.publish('right', { attemptId, session: a });
  assert.equal(text(generated(await store.page(pageId))[0]), 'generated');
});

test('worker reconnection in the same browser session does not interrupt generation', async (t) => {
  const store = await fixture(t);
  const { pageId, page } = await capture(store);
  await store.openSession('worker-reconnect', a);
  await complete(store, page, a);
  assert.equal((await store.page(pageId)).status, 'completed');
});

test('storage roundtrips may reorder object keys without changing an operation', async (t) => {
  const store = await fixture(t);
  const reordered = { epoch: a.epoch, sessionId: a.sessionId, installationId: a.installationId };
  const replay = await store.openSession('open-a', reordered);
  assert.equal(replay.replayed, true);
  const original = await capture(store);
  const reorderedPayload = {
    snapshot: { modules: original.payload.snapshot.modules, id: original.payload.snapshot.id },
    mainKey: original.payload.mainKey,
    session: reordered
  };
  assert.equal((await store.capture('capture', reorderedPayload)).pageId, original.pageId);
});

test('browser restart fails only its unfinished components and fences late results', async (t) => {
  const store = await fixture(t);
  const own = await capture(store);
  const other = await capture(store, 'capture-b', b);
  const [done, pending] = generated(own.page);
  await store.stage(done.attemptId, { ok: true, text: 'already saved' });
  await store.publish('complete-one', { attemptId: done.attemptId, session: a });
  await store.stage(pending.attemptId, { ok: true, text: 'late result' });
  await store.openSession('restart-a', { ...a, sessionId: 'a-2', epoch: 2 });
  const reconciled = generated(await store.page(own.pageId));
  assert.equal(text(reconciled[0]), 'already saved');
  assert.equal(text(reconciled[1]), '');
  assert.equal(reconciled[1].status, 'failed');
  assert.equal((await store.page(own.pageId)).status, 'failed');
  assert.equal((await store.page(other.pageId)).status, 'loading');
  await assert.rejects(async () => (await store.publish('late-publish', { attemptId: pending.attemptId, session: a })), code('stale_session'));
  await assert.rejects(async () => (await store.stage(pending.attemptId, { ok: true, text: 'even later' })), code('stale_attempt'));
  await assert.rejects(async () => (await store.openSession('delayed-old-handshake', a)), code('stale_session'));
  await complete(store, other.page, b);
});

test('a failed component discards its content without affecting the other; a completed empty component is valid', async (t) => {
  const store = await fixture(t);
  const { pageId, page } = await capture(store);
  const [first, second] = generated(page);
  await store.stage(first.attemptId, { ok: true, text: '' });
  await store.publish('empty', { attemptId: first.attemptId, session: a });
  await store.stage(second.attemptId, { ok: false, text: 'must not publish' });
  await store.publish('fail', { attemptId: second.attemptId, session: a });
  const result = await store.page(pageId);
  assert.deepEqual(generated(result).map(item => [item.status, text(item)]), [['completed', ''], ['failed', '']]);
  assert.equal(result.status, 'failed');
  await store.savePage('manual-after-failure', { pageId, changes: [{ componentId: second.id, content: textBlocks('manual') }] });
  assert.equal((await store.page(pageId)).status, 'failed');
});

test('save arrival order wins for the same component and preserves different components', async (t) => {
  const store = await fixture(t);
  const { pageId, page } = await capture(store);
  await complete(store, page, a);
  const [c1, c2] = generated(page).map(item => item.id);
  const first = await store.savePage('save-a', { pageId, changes: [{ componentId: c1, content: textBlocks('A') }] });
  const second = await store.savePage('save-b', { pageId, changes: [{ componentId: c1, content: textBlocks('B') }] });
  const third = await store.savePage('save-c', { pageId, changes: [{ componentId: c2, content: textBlocks('C') }] });
  assert.ok(first.sequence < second.sequence && second.sequence < third.sequence);
  const replay = await store.savePage('save-a', { pageId, changes: [{ componentId: c1, content: textBlocks('A') }] });
  assert.equal(replay.replayed, true);
  assert.deepEqual(generated(await store.page(pageId)).map(text), ['B', 'C']);
});

test('generation rejects an entire multi-component save; explicit resubmission is a new arrival', async (t) => {
  const store = await fixture(t);
  const { pageId, page } = await capture(store);
  await complete(store, page, a);
  const [c1, c2] = generated(page).map(item => item.id);
  const { attemptIds: [attemptId] } = await confirmed(store, 'retry', { pageId, target: { scope: 'component', componentId: c2 }, session: b });
  const payload = { pageId, changes: [{ componentId: c1, content: textBlocks('draft 1') }, { componentId: c2, content: textBlocks('draft 2') }] };
  await assert.rejects(async () => (await store.savePage('save-draft', payload)), code('generating'));
  assert.notEqual(text(generated(await store.page(pageId))[0]), 'draft 1');
  await assert.rejects(async () => (await confirmed(store, 'retry-again', { pageId, target: { scope: 'component', componentId: c2 }, session: a })), code('generating'));
  await store.stage(attemptId, { ok: true, text: 'new generated text' });
  await store.publish('publish-retry', { attemptId, session: b });
  assert.equal(text(generated(await store.page(pageId))[1]), 'new generated text');
  await store.savePage('save-draft', payload);
  assert.deepEqual(generated(await store.page(pageId)).map(text), ['draft 1', 'draft 2']);
});

test('capture uses its destination deck and that deck’s current configuration', async (t) => {
  const store = await fixture(t);
  const snapshot = await store.snapshot();
  const next = await store.createDeck('Another deck');
  await store.setDefault('change-default', next.id);
  const modules = await useModules(store, ['chinese'], snapshot.id);
  const { pageId } = await store.capture('old-snapshot', { session: a, mainKey: 'word', snapshot });
  const page = await store.page(pageId);
  assert.equal(page.deckId, snapshot.id);
  assert.deepEqual(generated(page).map(item => item.moduleType), modules.map(module => module.type));
  assert.deepEqual((await store.attempt(generated(page)[0].attemptId)).module, { id: generated(page)[0].moduleInstanceId, type: 'chinese', facets: ['examples', 'pinyin'] });
});

test('deletion prevents stale saves, retries, and generated results from recreating a page', async (t) => {
  const store = await fixture(t);
  const { pageId, page } = await capture(store);
  await store.deletePage('delete', pageId);
  await assert.rejects(async () => (await store.stage(generated(page)[0].attemptId, { ok: true, text: 'late' })), code('deleted'));
  await assert.rejects(async () => (await store.savePage('late-save', { pageId, changes: [] })), code('deleted'));
  await assert.rejects(async () => (await confirmed(store, 'late-retry', { pageId, target: { scope: 'page' }, session: a })), code('deleted'));
  assert.equal((await store.pages()).length, 0);
});
