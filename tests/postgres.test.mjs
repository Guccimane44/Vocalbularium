import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import test, { createTestStore, createTestDatabase, createTestApplication } from './helpers/database.mjs';
import { AccountStore } from '../src/core/store.mjs';
import { Generation } from '../src/server/generation.mjs';
import { migrateDatabase } from '../scripts/migrate.mjs';

const session = { installationId: 'parallel', sessionId: 'first', epoch: 1 };
function latch() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function captured(store) {
  await store.openSession('open', session);
  const snapshot = await store.snapshot();
  const { cardId } = await store.capture('capture', { session, selectedText: 'fixture', snapshot });
  return store.card(cardId);
}

test('concurrent operation replay commits one card and rejects a mismatched payload', async t => {
  const store = await createTestStore(t);
  const deck = await store.snapshot();
  const payload = { deckId: deck.id, pages: [] };
  const calls = Array.from({ length: 12 }, () => store.createManual('duplicate', payload));
  const mismatch = store.createManual('duplicate', { ...payload, pages: [{ pageId: deck.pages[0].id, text: 'different' }] });
  const settled = await Promise.allSettled([...calls, mismatch]);
  const results = settled.slice(0, 12).map(result => { assert.equal(result.status, 'fulfilled'); return result.value; });
  assert.equal(new Set(results.map(result => result.cardId)).size, 1);
  assert.equal(new Set(results.map(result => result.sequence)).size, 1);
  assert.equal(results.filter(result => !result.replayed).length, 1);
  assert.equal(settled[12].reason.code, 'operation_reused');
  assert.equal((await store.cards()).length, 1);
});

test('queued writes keep admission order and independent pages; replay cannot overwrite a later save', async t => {
  const store = await createTestStore(t), deck = await store.snapshot();
  const { cardId } = await store.createManual('create', { deckId: deck.id, pages: [] });
  const gate = latch(), entered = latch();
  const blocker = store.ordered(async () => { entered.resolve(); await gate.promise; });
  await entered.promise;
  const a = { cardId, changes: [{ pageId: deck.pages[0].id, text: 'first' }] };
  const b = { cardId, changes: [{ pageId: deck.pages[0].id, text: 'second' }] };
  const c = { cardId, changes: [{ pageId: deck.pages[1].id, text: 'independent' }] };
  const writes = [store.savePages('a', a), store.savePages('b', b), store.savePages('c', c), store.savePages('a', a)];
  gate.resolve(); await blocker;
  const results = await Promise.all(writes);
  assert.ok(results[0].sequence < results[1].sequence && results[1].sequence < results[2].sequence);
  assert.equal(results[3].sequence, results[0].sequence);
  assert.deepEqual((await store.card(cardId)).pages.map(page => page.text), ['second', 'independent']);
});

test('a save admitted during generation rejects atomically before later publication and requires explicit resubmission', async t => {
  const store = await createTestStore(t), card = await captured(store);
  for (const page of card.pages) {
    await store.stage(page.attempt_id, { ok: true, text: 'original' });
    await store.publish(page.page_id, { attemptId: page.attempt_id, session });
  }
  const { attemptId } = await store.retry('retry', { cardId: card.id, pageId: card.pages[1].page_id, session });
  const payload = { cardId: card.id, changes: card.pages.map(page => ({ pageId: page.page_id, text: 'draft' })) };
  const settled = await Promise.allSettled([
    store.savePages('draft', payload), store.stage(attemptId, { ok: true, text: 'generated' }),
    store.publish('complete', { attemptId, session })
  ]);
  assert.equal(settled[0].reason.code, 'generating');
  assert.equal(settled[1].status, 'fulfilled'); assert.equal(settled[2].status, 'fulfilled');
  assert.deepEqual((await store.card(card.id)).pages.map(page => page.text), ['original', 'generated']);
  await store.savePages('draft', payload);
  assert.deepEqual((await store.card(card.id)).pages.map(page => page.text), ['draft', 'draft']);
});

test('layout removal, card deletion, and session invalidation fence simultaneously submitted late results', async t => {
  const store = await createTestStore(t), card = await captured(store), deck = await store.snapshot();
  await store.stage(card.pages[1].attempt_id, { ok: true, text: 'obsolete' });
  deck.pages.pop();
  const layout = await Promise.allSettled([
    store.saveDeck('remove', { deck }), store.publish('obsolete', { attemptId: card.pages[1].attempt_id, session })
  ]);
  assert.equal(layout[0].status, 'fulfilled'); assert.equal(layout[1].reason.code, 'deleted');
  const sessionRace = await Promise.allSettled([
    store.openSession('restart', { ...session, sessionId: 'second', epoch: 2 }),
    store.stage(card.pages[0].attempt_id, { ok: true, text: 'late' })
  ]);
  assert.equal(sessionRace[0].status, 'fulfilled'); assert.equal(sessionRace[1].reason.code, 'stale_attempt');
  const deleted = await Promise.allSettled([
    store.deleteCard('delete', card.id), store.savePages('late-save', { cardId: card.id, changes: [] })
  ]);
  assert.equal(deleted[0].status, 'fulfilled'); assert.equal(deleted[1].reason.code, 'deleted');
  assert.equal((await store.cards()).length, 0);
});

test('rollback includes prior layout writes and receipts when a later page belongs to another deck', async t => {
  const store = await createTestStore(t), original = await store.snapshot();
  const other = await store.createDeck('other');
  const changed = { ...original, name: 'must roll back', pages: [original.pages[0], other.pages[1]] };
  await assert.rejects(store.saveDeck('invalid-layout', { deck: changed }), { code: 'invalid' });
  assert.deepEqual(await store.snapshot(), original);
  const valid = await store.saveDeck('invalid-layout', { deck: { ...original, name: 'valid reuse after rollback' } });
  assert.equal(valid.replayed, false);
});

test('restart preserves staged output, fails unowned generation, and excludes a second API or migration owner', async t => {
  const databaseKey = `restart-${randomUUID()}`;
  // Use the same PostgreSQL database across two stores without a filesystem journal.
  const database = await createTestDatabase(t, databaseKey);
  let store = await AccountStore.open(database);
  database.resources.push({ close: () => store.close() });
  const card = await captured(store);
  await store.stage(card.pages[0].attempt_id, { ok: true, text: 'durably staged' });
  await assert.rejects(AccountStore.open(database), /already has an API owner/);
  await assert.rejects(migrateDatabase(database.databaseUrl), /Stop the API/);
  await store.close();
  store = await AccountStore.open(database);
  const generation = await Generation.create(store, { interpret: () => assert.fail('must not restart'), generate: () => assert.fail('must not restart') });
  t.after(() => generation.close());
  assert.deepEqual((await store.card(card.id)).pages.map(page => page.status), ['loading', 'failed']);
  await store.publish('publish-staged', { attemptId: card.pages[0].attempt_id, session });
  assert.equal((await store.card(card.id)).pages[0].text, 'durably staged');
});

test('PostgreSQL lock waits are bounded and a failed command remains explicitly recoverable', async t => {
  const database = await createTestDatabase(t);
  const store = await AccountStore.open(database); database.resources.push(store);
  const deck = await store.snapshot();
  const blocker = new pg.Client({ connectionString: database.databaseUrl }); await blocker.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM account FOR UPDATE');
    await assert.rejects(store.createManual('blocked', { deckId: deck.id, pages: [] }), { code: '55P03' });
  } finally { await blocker.query('ROLLBACK'); await blocker.end(); }
  assert.equal((await store.cards()).length, 0);
  assert.equal((await store.createManual('blocked', { deckId: deck.id, pages: [] })).replayed, false);
});

test('database ownership loss makes readiness fail while liveness remains available', async t => {
  const key = `ownership-${randomUUID()}`;
  const application = await createTestApplication(t, { databaseKey: key, outbox: null });
  const database = await createTestDatabase(t, key);
  const origin = await application.start({ port: 0 });
  const killer = new pg.Client({ connectionString: database.databaseUrl }); await killer.connect();
  try {
    await killer.query(`SELECT pg_terminate_backend(pid) FROM pg_locks
      WHERE locktype = 'advisory' AND classid = 172910 AND objid = 1
      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`);
    // A round trip observes connection termination; no timed sleep establishes the result.
    await assert.rejects(application.store.account());
    assert.equal((await fetch(origin + '/health/ready')).status, 503);
    assert.equal((await fetch(origin + '/health/live')).status, 200);
  } finally { await killer.end(); }
});

test('a lost database connection preserves generated output in the journal for restart and explicit publication', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-postgres-outage-'));
  const key = join(directory, 'account');
  const started = latch(), release = latch();
  let calls = 0;
  let application = await createTestApplication(t, { databaseKey: key, provider: {
    interpret: async () => ({ inputType: 'word_phrase', sourceLanguage: 'English' }),
    generate: async () => { calls++; started.resolve(); await release.promise; return 'survives a real database outage'; }
  } });
  t.after(async () => { release.resolve(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const database = await createTestDatabase(t, key);
  const card = await captured(application.store);
  await application.generation.start(card.id);
  await started.promise;
  // A model call waiting on the provider must not hold the account executor.
  await application.store.createDeck('Independent write during generation');
  const killer = new pg.Client({ connectionString: database.databaseUrl }); await killer.connect();
  try {
    await killer.query(`SELECT pg_terminate_backend(pid) FROM pg_locks
      WHERE locktype = 'advisory' AND classid = 172910 AND objid = 1
      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`);
  } finally { await killer.end(); }
  release.resolve();
  await Promise.all([...application.generation.tasks.values()].map(value => value.task));
  const attemptId = card.pages[1].attempt_id;
  assert.ok(application.generation.pendingResults.has(attemptId));
  await application.close();
  application = await createTestApplication(t, { databaseKey: key, provider: {
    interpret: () => assert.fail('restart must not generate'), generate: () => assert.fail('restart must not generate')
  } });
  await application.store.publish('recover-outage', { attemptId, session });
  assert.equal((await application.store.card(card.id)).pages[1].text, 'survives a real database outage');
  assert.equal(calls, 1);
});

test('reapplying reviewed migrations preserves an initialized database and operation receipts', async t => {
  const database = await createTestDatabase(t);
  let store = await AccountStore.open(database); database.resources.push({ close: () => store.close() });
  const snapshot = await store.snapshot();
  const payload = { deckId: snapshot.id, pages: [] };
  const receipt = await store.createManual('before-migration', payload);
  await store.close();
  await migrateDatabase(database.databaseUrl);
  store = await AccountStore.open(database);
  assert.deepEqual(await store.snapshot(), snapshot);
  assert.equal((await store.createManual('before-migration', payload)).sequence, receipt.sequence);
  assert.equal((await store.cards()).length, 1);
});

test('test fixtures and restore tooling refuse the development database as a reset target', async t => {
  const previous = process.env.TEST_DATABASE_ADMIN_URL;
  process.env.TEST_DATABASE_ADMIN_URL = 'postgresql://vocabularium_test@127.0.0.1:5432/vocabularium_dev';
  try { await assert.rejects(createTestDatabase(t), /development databases cannot be reset/); }
  finally {
    if (previous === undefined) delete process.env.TEST_DATABASE_ADMIN_URL;
    else process.env.TEST_DATABASE_ADMIN_URL = previous;
  }
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['scripts/database-backup.mjs', 'restore', 'unused.dump', 'vocabularium_dev'], {
    encoding: 'utf8', env: { ...process.env, TEST_DATABASE_ADMIN_URL: 'postgresql://vocabularium_test@127.0.0.1:5432/postgres' }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /development\/test databases cannot be reset/);
});
