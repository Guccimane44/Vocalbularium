import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../src/core/store.mjs';

const a = { installationId: 'a', sessionId: 'a-1', epoch: 1 };
const b = { installationId: 'b', sessionId: 'b-1', epoch: 1 };
function fixture(t, filename) {
  const store = new AccountStore(filename);
  t.after(() => store.close());
  store.openSession('open-a', a);
  store.openSession('open-b', b);
  return store;
}
function capture(store, id = 'capture', session = a, selectedText = '  幸福\n') {
  const payload = { session, selectedText, snapshot: store.snapshot() };
  const result = store.capture(id, payload);
  return { ...result, payload, card: store.card(result.cardId) };
}
function complete(store, card, session = a) {
  for (const page of card.pages) {
    store.stage(page.attempt_id, { ok: true, text: `page ${page.page_id}` });
    store.publish(`publish-${page.attempt_id}`, { attemptId: page.attempt_id, session });
  }
}
const code = expected => error => error.code === expected;

test('account initialization is persistent and occurs once', t => {
  const directory = mkdtempSync(join(tmpdir(), 'vocabularium-db-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'account.sqlite');
  const first = new AccountStore(filename);
  first.openSession('open-a', a);
  const initial = first.snapshot();
  const { cardId } = capture(first);
  first.close();
  const reopened = new AccountStore(filename);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.snapshot(), initial);
  assert.equal(reopened.cards().length, 1);
  assert.equal(reopened.card(cardId).selected_text, '  幸福\n');
});

test('uncertain capture resubmission preserves identity; separate identical captures remain separate', t => {
  const store = fixture(t);
  const first = capture(store);
  const replay = store.capture('capture', first.payload);
  const second = capture(store, 'capture-2');
  assert.equal(replay.cardId, first.cardId);
  assert.equal(replay.sequence, first.sequence);
  assert.equal(replay.replayed, true);
  assert.notEqual(second.cardId, first.cardId);
  assert.equal(store.cards().length, 2);
  assert.throws(() => store.capture('capture', { ...first.payload, selectedText: 'other' }), code('operation_reused'));
});

test('server stage cannot publish; another installation cannot publish its result', t => {
  const store = fixture(t);
  const { cardId, card } = capture(store);
  const attemptId = card.pages[0].attempt_id;
  store.stage(attemptId, { ok: true, text: 'generated' });
  assert.equal(store.card(cardId).pages[0].text, '');
  assert.equal(store.card(cardId).status, 'loading');
  assert.throws(() => store.publish('wrong', { attemptId, session: b }), code('wrong_session'));
  store.publish('right', { attemptId, session: a });
  assert.equal(store.card(cardId).pages[0].text, 'generated');
});

test('worker reconnection in the same browser session does not interrupt generation', t => {
  const store = fixture(t);
  const { cardId, card } = capture(store);
  store.openSession('worker-reconnect', a);
  complete(store, card);
  assert.equal(store.card(cardId).status, 'completed');
});

test('browser restart fails only its unfinished pages and fences late results', t => {
  const store = fixture(t);
  const own = capture(store);
  const other = capture(store, 'capture-b', b);
  const doneId = own.card.pages[0].attempt_id;
  const pendingId = own.card.pages[1].attempt_id;
  store.stage(doneId, { ok: true, text: 'already saved' });
  store.publish('complete-one', { attemptId: doneId, session: a });
  store.stage(pendingId, { ok: true, text: 'late result' });
  store.openSession('restart-a', { ...a, sessionId: 'a-2', epoch: 2 });
  const reconciled = store.card(own.cardId);
  assert.equal(reconciled.pages[0].text, 'already saved');
  assert.equal(reconciled.pages[1].text, '');
  assert.equal(reconciled.pages[1].status, 'failed');
  assert.equal(reconciled.status, 'failed');
  assert.equal(store.card(other.cardId).status, 'loading');
  assert.throws(() => store.publish('late-publish', { attemptId: pendingId, session: a }), code('stale_session'));
  assert.throws(() => store.stage(pendingId, { ok: true, text: 'even later' }), code('stale_attempt'));
  assert.throws(() => store.openSession('delayed-old-handshake', a), code('stale_session'));
  complete(store, other.card, b);
});

test('failed attempt discards content; a completed empty page is valid', t => {
  const store = fixture(t);
  const { cardId, card } = capture(store);
  store.stage(card.pages[0].attempt_id, { ok: true, text: '' });
  store.publish('empty', { attemptId: card.pages[0].attempt_id, session: a });
  store.stage(card.pages[1].attempt_id, { ok: false, text: 'must not publish' });
  store.publish('fail', { attemptId: card.pages[1].attempt_id, session: a });
  const result = store.card(cardId);
  assert.equal(result.pages[0].status, 'completed');
  assert.equal(result.pages[1].text, '');
  assert.equal(result.status, 'failed');
  store.savePages('manual-after-failure', { cardId, changes: [{ pageId: card.pages[1].page_id, text: 'manual' }] });
  assert.equal(store.card(cardId).status, 'failed');
});

test('save arrival order wins for the same page and preserves different pages', t => {
  const store = fixture(t);
  const { cardId, card } = capture(store);
  complete(store, card);
  const [p1, p2] = card.pages.map(page => page.page_id);
  const first = store.savePages('save-a', { cardId, changes: [{ pageId: p1, text: 'A' }] });
  const second = store.savePages('save-b', { cardId, changes: [{ pageId: p1, text: 'B' }] });
  const third = store.savePages('save-c', { cardId, changes: [{ pageId: p2, text: 'C' }] });
  assert.ok(first.sequence < second.sequence && second.sequence < third.sequence);
  const replay = store.savePages('save-a', { cardId, changes: [{ pageId: p1, text: 'A' }] });
  assert.equal(replay.replayed, true);
  assert.deepEqual(store.card(cardId).pages.map(page => page.text), ['B', 'C']);
});

test('generation rejects an entire multi-page save; explicit resubmission is a new arrival', t => {
  const store = fixture(t);
  const { cardId, card } = capture(store);
  complete(store, card);
  const [p1, p2] = card.pages.map(page => page.page_id);
  const { attemptId } = store.retry('retry', { cardId, pageId: p2, session: b });
  const payload = { cardId, changes: [{ pageId: p1, text: 'draft 1' }, { pageId: p2, text: 'draft 2' }] };
  assert.throws(() => store.savePages('save-draft', payload), code('generating'));
  assert.notEqual(store.card(cardId).pages[0].text, 'draft 1');
  assert.throws(() => store.retry('retry-again', { cardId, pageId: p2, session: a }), code('generating'));
  store.stage(attemptId, { ok: true, text: 'new generated text' });
  store.publish('publish-retry', { attemptId, session: b });
  assert.equal(store.card(cardId).pages[1].text, 'new generated text');
  store.savePages('save-draft', payload);
  assert.deepEqual(store.card(cardId).pages.map(page => page.text), ['draft 1', 'draft 2']);
});

test('capture snapshot keeps its destination and instructions, with stable retained page identities', t => {
  const store = fixture(t);
  const snapshot = store.snapshot();
  const next = store.createDeck('Another deck');
  store.db.prepare('UPDATE account SET default_deck_id = ?').run(next.id);
  store.db.prepare('UPDATE layout_pages SET modules = ? WHERE id = ?')
    .run(JSON.stringify([{ id: 'new-module', type: 'sentence-usage' }]), snapshot.pages[0].id);
  store.db.prepare('INSERT INTO layout_pages VALUES (?, ?, ?, ?)').run('appended', snapshot.id, 2, '[]');
  const { cardId } = store.capture('old-snapshot', { session: a, selectedText: 'word', snapshot });
  const card = store.card(cardId);
  assert.equal(card.deck_id, snapshot.id);
  assert.deepEqual(store.attempt(card.pages[0].attempt_id).modules, snapshot.pages[0].modules);
  assert.equal(card.pages[2].status, null);
  const retained = card.pages[1];
  store.db.prepare('DELETE FROM layout_pages WHERE id = ?').run(snapshot.pages[0].id);
  store.stage(retained.attempt_id, { ok: true, text: 'retained page output' });
  store.publish('retained', { attemptId: retained.attempt_id, session: a });
  assert.equal(store.card(cardId).pages[0].text, 'retained page output');
});

test('deletion prevents stale saves, retries, and generated results from recreating a card', t => {
  const store = fixture(t);
  const { cardId, card } = capture(store);
  store.deleteCard('delete', cardId);
  assert.throws(() => store.stage(card.pages[0].attempt_id, { ok: true, text: 'late' }), code('deleted'));
  assert.throws(() => store.savePages('late-save', { cardId, changes: [] }), code('deleted'));
  assert.throws(() => store.retry('late-retry', { cardId, pageId: card.pages[0].page_id, session: a }), code('deleted'));
  assert.equal(store.cards().length, 0);
});
