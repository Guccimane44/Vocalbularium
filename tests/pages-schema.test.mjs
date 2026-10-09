import { legacyDatabase } from './helpers/legacy-database.mjs';
import assert from 'node:assert/strict';
import pg from 'pg';
import test, { createTestDatabase } from './helpers/database.mjs';
import { AccountStore } from '../src/core/store.mjs';
import { migrateDatabase } from '../scripts/migrate.mjs';

const session = { installationId: 'schema', sessionId: 'first', epoch: 1 };
const oldTables = ['account', 'decks', 'layout_seites', 'kartes', 'seites', 'attempts', 'receipts', 'installations', 'credentials', 'login_tokens'];
const newTables = ['deck_modules', 'pages', 'components', 'generation_runs', 'component_attempts'];

async function connect(t, database) {
  const client = new pg.Client({ connectionString: database.databaseUrl });
  await client.connect();
  t.after(() => client.end());
  return client;
}
// Row-for-row digest of the karte/seite data, excluding the new decks.view column.
async function digest(client) {
  const tables = {};
  for (const table of oldTables) {
    const { rows } = await client.query(`SELECT to_jsonb(t) - 'view' AS row FROM "${table}" t`);
    tables[table] = rows.map(({ row }) => JSON.stringify(row)).sort();
  }
  return tables;
}

test('0003 adds the page/component tables without touching populated 0.3.0+ data', async t => {
  const database = await legacyDatabase(t, 'pages-upgrade', 2);
  let store = await AccountStore.open(database);
  await store.openSession('open', session);
  const snapshot = await store.snapshot();
  await store.capture('capture', { session, selectedText: '幸福', snapshot });
  await store.createManual('manual', { deckId: snapshot.id, seites: [{ seiteId: snapshot.seites[0].id, text: 'manual text' }] });
  const kartes = await store.kartes();
  await store.close();

  const client = await connect(t, database);
  const before = await digest(client);
  assert.ok(before.kartes.length === 2 && before.receipts.length > 0);
  await migrateDatabase(database.databaseUrl);
  assert.deepEqual(await digest(client), before);
  for (const table of newTables) assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0, table);
  assert.deepEqual((await client.query('SELECT DISTINCT view FROM decks')).rows, [{ view: 'default' }]);

  // The running karte/seite store keeps working on the upgraded schema.
  store = await AccountStore.open(database); database.resources.push(store);
  assert.deepEqual(await store.snapshot(), snapshot);
  assert.deepEqual(await store.kartes(), kartes);
});

test('page/component tables enforce ownership, uniqueness, limits and cascades', async t => {
  const database = await createTestDatabase(t);
  const client = await connect(t, database);
  const rejects = (sql, params, pattern) => assert.rejects(client.query(sql, params), pattern);
  const deck = 'deck';
  await client.query("INSERT INTO decks (id, name) VALUES ('deck', 'My Deck'); INSERT INTO account VALUES (1, 'deck')");
  await client.query("INSERT INTO installations VALUES ('i', 1, 's')");

  for (let position = 0; position < 12; position++) {
    await client.query('INSERT INTO deck_modules VALUES ($1, $2, $3, $4)', [`m${position}`, deck, position, 'german-examples']);
  }
  await rejects('INSERT INTO deck_modules VALUES ($1, $2, 12, $3)', ['m12', deck, 'selected'], /deck_module_limit/);
  await rejects('INSERT INTO deck_modules VALUES ($1, $2, 0, $3)', ['dup', deck, 'selected'], /deck_module_position/);
  await rejects("UPDATE decks SET view = 'card' WHERE id = $1", [deck], /deck_view/);

  await client.query("INSERT INTO pages (id, deck_id, selected_text, created_at) VALUES ('p', $1, '幸福', '1')", [deck]);
  const component = (id, kind, instance, position) => client.query(
    "INSERT INTO components (page_id, id, kind, module_instance_id, position, content) VALUES ('p', $1, $2, $3, $4, '{}')",
    [id, kind, instance, position]);
  await component('key', 'main_key', null, 0);
  await component('ctx', 'context', null, 1);
  await component('c0', 'module', 'm0', 2);
  await component('old', 'module', 'removed-instance', 3);
  await component('mine', 'manual', null, 4);
  await assert.rejects(component('key2', 'main_key', null, 5), /components_single_main_key/);
  await assert.rejects(component('ctx2', 'context', null, 5), /components_single_context/);
  await assert.rejects(component('c0-again', 'module', 'm0', 5), /components_module_instance/);
  await assert.rejects(component('orphan', 'module', null, 5), /component_owner/);
  await assert.rejects(component('owned-manual', 'manual', 'm1', 5), /component_owner/);
  await assert.rejects(component('odd', 'image', null, 5), /component_kind/);
  await rejects("UPDATE components SET status = 'done' WHERE id = 'c0'", [], /component_status/);

  await client.query("INSERT INTO generation_runs VALUES ('r', 'p', NULL)");
  await client.query("INSERT INTO component_attempts (id, page_id, component_id, run_id, installation_id, session_id, epoch, module) VALUES ('a', 'p', 'c0', 'r', 'i', 's', 1, '{}')");
  await rejects("INSERT INTO component_attempts (id, page_id, component_id, run_id, installation_id, session_id, epoch, module) VALUES ('b', 'p', 'nope', 'r', 'i', 's', 1, '{}')", [], /foreign key/);
  await rejects("UPDATE component_attempts SET state = 'queued'", [], /component_attempt_state/);

  // Removing an instance from the deck leaves its components on the page.
  await client.query("DELETE FROM deck_modules WHERE id = 'm0'");
  assert.equal((await client.query("SELECT count(*)::int AS n FROM components WHERE id = 'c0'")).rows[0].n, 1);

  await client.query("DELETE FROM pages WHERE id = 'p'");
  for (const table of ['components', 'generation_runs', 'component_attempts']) {
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0, table);
  }
  await client.query("INSERT INTO pages (id, deck_id, created_at) VALUES ('q', $1, '2')", [deck]);
  await client.query("INSERT INTO decks (id, name) VALUES ('other', 'Other')");
  await client.query("UPDATE account SET default_deck_id = 'other'");
  await client.query('DELETE FROM decks WHERE id = $1', [deck]);
  for (const table of ['pages', 'deck_modules']) {
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0, table);
  }
});
