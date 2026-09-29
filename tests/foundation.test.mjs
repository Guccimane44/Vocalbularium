import test, { createTestStore } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const a = { installationId: 'a', sessionId: 'a-1', epoch: 1 };
const b = { installationId: 'b', sessionId: 'b-1', epoch: 1 };
async function fixture(t, databaseKey) {
  const store = await createTestStore(t, databaseKey);
  t.after(async () => (await store.close()));
  await store.openSession('open-a', a);
  await store.openSession('open-b', b);
  return store;
}
async function capture(store, id = 'capture', session = a, selectedText = '  幸福\n') {
  const payload = { session, selectedText, snapshot: (await store.snapshot()) };
  const result = await store.capture(id, payload);
  return { ...result, payload, card: (await store.karte(result.cardId)) };
}
async function complete(store, karte, session = a) {
  for (const page of karte.pages) {
    await store.stage(page.attempt_id, { ok: true, text: `seite ${page.page_id}` });
    await store.publish(`publish-${page.attempt_id}`, { attemptId: page.attempt_id, session });
  }
}
const code = expected => error => error.code === expected;

test('account initialization is persistent and occurs once', async (t) => {
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
  const { cardId: karteId } = await capture(first);
  await first.close();
  reopened = (await createTestStore(t, databaseKey));
  assert.deepEqual((await reopened.snapshot()), initial);
  assert.equal((await reopened.kartes()).length, 1);
  assert.equal((await reopened.karte(karteId)).selected_text, '  幸福\n');
});

test('uncertain capture resubmission preserves identity; separate identical captures remain separate', async (t) => {
  const store = await fixture(t);
  const first = await capture(store);
  const replay = await store.capture('capture', first.payload);
  const second = await capture(store, 'capture-2');
  assert.equal(replay.cardId, first.cardId);
  assert.equal(replay.sequence, first.sequence);
  assert.equal(replay.replayed, true);
  assert.notEqual(second.cardId, first.cardId);
  assert.equal((await store.kartes()).length, 2);
  await assert.rejects(async () => (await store.capture('capture', { ...first.payload, selectedText: 'other' })), code('operation_reused'));
});

test('server stage cannot publish; another installation cannot publish its result', async (t) => {
  const store = await fixture(t);
  const { cardId: karteId, card: karte } = await capture(store);
  const attemptId = karte.pages[0].attempt_id;
  await store.stage(attemptId, { ok: true, text: 'generated' });
  assert.equal((await store.karte(karteId)).pages[0].text, '');
  assert.equal((await store.karte(karteId)).status, 'loading');
  await assert.rejects(async () => (await store.publish('wrong', { attemptId, session: b })), code('wrong_session'));
  await store.publish('right', { attemptId, session: a });
  assert.equal((await store.karte(karteId)).pages[0].text, 'generated');
});

test('worker reconnection in the same browser session does not interrupt generation', async (t) => {
  const store = await fixture(t);
  const { cardId: karteId, card: karte } = await capture(store);
  await store.openSession('worker-reconnect', a);
  await complete(store, karte);
  assert.equal((await store.karte(karteId)).status, 'completed');
});

test('storage roundtrips may reorder object keys without changing an operation', async (t) => {
  const store = await fixture(t);
  const reordered = { epoch: a.epoch, sessionId: a.sessionId, installationId: a.installationId };
  const replay = await store.openSession('open-a', reordered);
  assert.equal(replay.replayed, true);
  const original = await capture(store);
  const reorderedPayload = {
    snapshot: { pages: original.payload.snapshot.pages, id: original.payload.snapshot.id, name: original.payload.snapshot.name },
    selectedText: original.payload.selectedText,
    session: reordered
  };
  assert.equal((await store.capture('capture', reorderedPayload)).cardId, original.cardId);
});

test('browser restart fails only its unfinished seites and fences late results', async (t) => {
  const store = await fixture(t);
  const own = await capture(store);
  const other = await capture(store, 'capture-b', b);
  const doneId = own.card.pages[0].attempt_id;
  const pendingId = own.card.pages[1].attempt_id;
  await store.stage(doneId, { ok: true, text: 'already saved' });
  await store.publish('complete-one', { attemptId: doneId, session: a });
  await store.stage(pendingId, { ok: true, text: 'late result' });
  await store.openSession('restart-a', { ...a, sessionId: 'a-2', epoch: 2 });
  const reconciled = await store.karte(own.cardId);
  assert.equal(reconciled.pages[0].text, 'already saved');
  assert.equal(reconciled.pages[1].text, '');
  assert.equal(reconciled.pages[1].status, 'failed');
  assert.equal(reconciled.status, 'failed');
  assert.equal((await store.karte(other.cardId)).status, 'loading');
  await assert.rejects(async () => (await store.publish('late-publish', { attemptId: pendingId, session: a })), code('stale_session'));
  await assert.rejects(async () => (await store.stage(pendingId, { ok: true, text: 'even later' })), code('stale_attempt'));
  await assert.rejects(async () => (await store.openSession('delayed-old-handshake', a)), code('stale_session'));
  await complete(store, other.card, b);
});

test('failed attempt discards content; a completed empty seite is valid', async (t) => {
  const store = await fixture(t);
  const { cardId: karteId, card: karte } = await capture(store);
  await store.stage(karte.pages[0].attempt_id, { ok: true, text: '' });
  await store.publish('empty', { attemptId: karte.pages[0].attempt_id, session: a });
  await store.stage(karte.pages[1].attempt_id, { ok: false, text: 'must not publish' });
  await store.publish('fail', { attemptId: karte.pages[1].attempt_id, session: a });
  const result = await store.karte(karteId);
  assert.equal(result.pages[0].status, 'completed');
  assert.equal(result.pages[1].text, '');
  assert.equal(result.status, 'failed');
  await store.saveSeites('manual-after-failure', { cardId: karteId, changes: [{ pageId: karte.pages[1].page_id, text: 'manual' }] });
  assert.equal((await store.karte(karteId)).status, 'failed');
});

test('save arrival order wins for the same seite and preserves different seites', async (t) => {
  const store = await fixture(t);
  const { cardId: karteId, card: karte } = await capture(store);
  await complete(store, karte);
  const [p1, p2] = karte.pages.map(page => page.page_id);
  const first = await store.saveSeites('save-a', { cardId: karteId, changes: [{ pageId: p1, text: 'A' }] });
  const second = await store.saveSeites('save-b', { cardId: karteId, changes: [{ pageId: p1, text: 'B' }] });
  const third = await store.saveSeites('save-c', { cardId: karteId, changes: [{ pageId: p2, text: 'C' }] });
  assert.ok(first.sequence < second.sequence && second.sequence < third.sequence);
  const replay = await store.saveSeites('save-a', { cardId: karteId, changes: [{ pageId: p1, text: 'A' }] });
  assert.equal(replay.replayed, true);
  assert.deepEqual((await store.karte(karteId)).pages.map(page => page.text), ['B', 'C']);
});

test('generation rejects an entire multi-seite save; explicit resubmission is a new arrival', async (t) => {
  const store = await fixture(t);
  const { cardId: karteId, card: karte } = await capture(store);
  await complete(store, karte);
  const [p1, p2] = karte.pages.map(page => page.page_id);
  const { attemptId } = await store.retry('retry', { cardId: karteId, pageId: p2, session: b });
  const payload = { cardId: karteId, changes: [{ pageId: p1, text: 'draft 1' }, { pageId: p2, text: 'draft 2' }] };
  await assert.rejects(async () => (await store.saveSeites('save-draft', payload)), code('generating'));
  assert.notEqual((await store.karte(karteId)).pages[0].text, 'draft 1');
  await assert.rejects(async () => (await store.retry('retry-again', { cardId: karteId, pageId: p2, session: a })), code('generating'));
  await store.stage(attemptId, { ok: true, text: 'new generated text' });
  await store.publish('publish-retry', { attemptId, session: b });
  assert.equal((await store.karte(karteId)).pages[1].text, 'new generated text');
  await store.saveSeites('save-draft', payload);
  assert.deepEqual((await store.karte(karteId)).pages.map(page => page.text), ['draft 1', 'draft 2']);
});

test('capture snapshot keeps its destination and instructions, with stable retained seite identities', async (t) => {
  const store = await fixture(t);
  const snapshot = await store.snapshot();
  const next = await store.createDeck('Another deck');
  await store.setDefault('change-default', next.id);
  const changed = structuredClone(snapshot);
  changed.pages[0].modules = [{ id: 'new-module', type: 'sentence-usage' }];
  changed.pages.push({ id: 'appended', modules: [] });
  await store.saveDeck('change-layout', { deck: changed, basePageIds: snapshot.pages.map(page => page.id) });
  const { cardId: karteId } = await store.capture('old-snapshot', { session: a, selectedText: 'word', snapshot });
  const karte = await store.karte(karteId);
  assert.equal(karte.deck_id, snapshot.id);
  assert.deepEqual((await store.attempt(karte.pages[0].attempt_id)).modules, snapshot.pages[0].modules);
  assert.equal(karte.pages[2].status, null);
  const retained = karte.pages[0];
  const shortened = structuredClone(changed);
  shortened.pages.splice(1, 1);
  await store.saveDeck('remove-middle', { deck: shortened, basePageIds: changed.pages.map(page => page.id) });
  await store.stage(retained.attempt_id, { ok: true, text: 'retained seite output' });
  await store.publish('retained', { attemptId: retained.attempt_id, session: a });
  assert.equal((await store.karte(karteId)).pages[0].text, 'retained seite output');
});

test('deletion prevents stale saves, retries, and generated results from recreating a karte', async (t) => {
  const store = await fixture(t);
  const { cardId: karteId, card: karte } = await capture(store);
  await store.deleteKarte('delete', karteId);
  await assert.rejects(async () => (await store.stage(karte.pages[0].attempt_id, { ok: true, text: 'late' })), code('deleted'));
  await assert.rejects(async () => (await store.saveSeites('late-save', { cardId: karteId, changes: [] })), code('deleted'));
  await assert.rejects(async () => (await store.retry('late-retry', { cardId: karteId, pageId: karte.pages[0].page_id, session: a })), code('deleted'));
  assert.equal((await store.kartes()).length, 0);
});
