import assert from 'node:assert/strict';
import pg from 'pg';
import test, { createTestApplication, createTestDatabase } from './helpers/database.mjs';
import { legacyDatabase, populateKarteSchema } from './helpers/legacy-database.mjs';
import { migrateDatabase } from '../scripts/migrate.mjs';
import { Postgres } from '../src/persistence/postgres.ts';
import { Authentication } from '../src/server/auth.mjs';
import { AccountStore } from '../src/core/store.mjs';

async function rows(client, table) {
  return (await client.query(`SELECT to_jsonb(t) AS row FROM "${table}" t`)).rows.map(({ row }) => JSON.stringify(row)).sort();
}

test('0004 discards 0.3.0+ content, keeps accounts and sign-in, and starts one fresh default deck', async t => {
  const key = 'discard-upgrade';
  const database = await legacyDatabase(t, key, 2);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  await populateKarteSchema(client);
  // Sign in through the real authentication path before the upgrade.
  const persistence = new Postgres(database.databaseUrl);
  await persistence.initialize();
  const authentication = new Authentication(persistence);
  await authentication.initialize();
  const { token } = await authentication.login('admin', 'admin');
  await persistence.close();
  const kept = {};
  for (const table of ['credentials', 'login_tokens', 'installations']) kept[table] = await rows(client, table);

  await migrateDatabase(database.databaseUrl);

  const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows.map(row => row.table_name);
  for (const retired of ['kartes', 'seites', 'layout_seites', 'attempts']) assert.ok(!tables.includes(retired), retired);
  for (const table of Object.keys(kept)) assert.deepEqual(await rows(client, table), kept[table], table);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM receipts')).rows[0].n, 0);
  const decks = (await client.query('SELECT id, name, view FROM decks')).rows;
  assert.equal(decks.length, 1);
  assert.equal(decks[0].name, 'My Deck'); assert.equal(decks[0].view, 'default');
  assert.ok(!['deck-a', 'deck-b'].includes(decks[0].id));
  assert.deepEqual((await client.query('SELECT default_deck_id FROM account')).rows, [{ default_deck_id: decks[0].id }]);
  assert.deepEqual((await client.query('SELECT position, type FROM deck_modules WHERE deck_id = $1', [decks[0].id])).rows,
    [{ position: 0, type: 'german-examples' }]);

  // The owner is still signed in and sees an empty account.
  const application = await createTestApplication(t, { databaseKey: key, outbox: null });
  const url = await application.start({ port: 0 });
  const account = await fetch(url + '/api/account', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(account.status, 200);
  const body = await account.json();
  assert.equal(body.defaultDeckId, decks[0].id);
  assert.equal(body.decks.length, 1); assert.deepEqual(body.pages, []);
  await application.close();
});

test('a new database gets exactly one default deck, created by the store', async t => {
  const database = await createTestDatabase(t);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  assert.equal((await client.query('SELECT count(*)::int AS n FROM decks')).rows[0].n, 0, '0004 creates no deck without an account');
  const store = await AccountStore.open(database); database.resources.push(store);
  const decks = (await store.account()).decks;
  assert.equal(decks.length, 1);
  assert.deepEqual(decks[0].modules.map(module => module.type), ['german-examples']);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM decks')).rows[0].n, 1);
});
