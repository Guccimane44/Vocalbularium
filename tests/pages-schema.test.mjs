import { legacyDatabase, migrateTo, populateKarteSchema } from './helpers/legacy-database.mjs';
import assert from 'node:assert/strict';
import pg from 'pg';
import test, { createTestDatabase } from './helpers/database.mjs';

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
  const client = await connect(t, database);
  await populateKarteSchema(client);
  await client.query("INSERT INTO credentials VALUES ('admin', 'salt', 'hash', 1); INSERT INTO login_tokens VALUES ('token', 1, 1)");
  const before = await digest(client);
  await migrateTo(t, database, 3);
  assert.deepEqual(await digest(client), before);
  for (const table of newTables) assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0, table);
  assert.deepEqual((await client.query('SELECT DISTINCT view FROM decks')).rows, [{ view: 'default' }]);
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
  // Page-owned modules (0008): each component names its page's module instance and type.
  const component = (id, type, instance, position) => client.query(
    "INSERT INTO components (page_id, id, module_instance_id, module_type, position, content) VALUES ('p', $1, $2, $3, $4, '{}')",
    [id, instance, type, position]);
  await component('key', 'main-key', 'i-key', 0);
  await component('ctx', 'context', 'i-ctx', 1);
  await component('c0', 'german-examples', 'i-c0', 2);
  await component('mine', 'text', 'i-mine', 3);
  await component('more', 'text', 'i-more', 4);
  await assert.rejects(component('key2', 'main-key', 'i-key2', 5), /components_single_main_key_module|component_main_key_first/);
  await assert.rejects(component('ctx2', 'context', 'i-ctx2', 5), /components_single_context_module/);
  await assert.rejects(component('c0-again', 'german-examples', 'i-c0', 5), /components_module_instance/);
  await assert.rejects(component('no-instance', 'text', null, 5), /not-null|null value/);
  await assert.rejects(component('above-key', 'text', 'i-above', 0), /component_main_key_first/);
  await assert.rejects(component('thirteenth', 'text', 'i-13', 12), /component_limit/);
  await rejects("UPDATE components SET status = 'done' WHERE id = 'c0'", [], /component_status/);

  await client.query("INSERT INTO generation_runs VALUES ('r', 'p', NULL)");
  await client.query("INSERT INTO component_attempts (id, page_id, component_id, run_id, installation_id, session_id, epoch, module) VALUES ('a', 'p', 'c0', 'r', 'i', 's', 1, '{}')");
  await rejects("INSERT INTO component_attempts (id, page_id, component_id, run_id, installation_id, session_id, epoch, module) VALUES ('b', 'p', 'nope', 'r', 'i', 's', 1, '{}')", [], /foreign key/);
  await rejects("UPDATE component_attempts SET state = 'queued'", [], /component_attempt_state/);

  // Page instances are the page's own: removing a deck module leaves the page alone.
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

test('0007 adds page-owned module columns and input-module uniqueness without touching 0.4.x data', async t => {
  const database = await legacyDatabase(t, 'page-modules-0007', 7);
  const client = await connect(t, database);
  await client.query("INSERT INTO decks (id, name) VALUES ('deck', 'My Deck'), ('other', 'Other'); INSERT INTO account VALUES (1, 'deck')");
  await client.query("INSERT INTO pages (id, deck_id, selected_text, created_at) VALUES ('p', 'deck', '幸福', '1')");
  // Existing 0.4.x rows keep working with no module type.
  await client.query("INSERT INTO components (page_id, id, kind, module_instance_id, position, content) VALUES ('p', 'key', 'main_key', NULL, 0, '{}')");
  assert.deepEqual((await client.query("SELECT module_type FROM components WHERE id = 'key'")).rows, [{ module_type: null }]);

  const module = (id, deck, position, type) => client.query('INSERT INTO deck_modules VALUES ($1, $2, $3, $4)', [id, deck, position, type]);
  await module('k', 'deck', 0, 'main-key'); await module('c', 'deck', 1, 'context');
  await module('t1', 'deck', 2, 'text'); await module('t2', 'deck', 3, 'text');
  await assert.rejects(module('k2', 'deck', 4, 'main-key'), /deck_modules_single_main_key/);
  await assert.rejects(module('c2', 'deck', 4, 'context'), /deck_modules_single_context/);
  await module('k-other', 'other', 0, 'main-key');

  const component = (id, type, position) => client.query(
    "INSERT INTO components (page_id, id, kind, module_instance_id, position, content, module_type) VALUES ('p', $1, 'module', $2, $3, '{}', $4)",
    [id, `i-${id}`, position, type]);
  await component('k-module', 'main-key', 1); await component('c-module', 'context', 2);
  await component('t1', 'text', 3); await component('t2', 'text', 4);
  await assert.rejects(component('k-again', 'main-key', 5), /components_single_main_key_module/);
  await assert.rejects(component('c-again', 'context', 5), /components_single_context_module/);
});
