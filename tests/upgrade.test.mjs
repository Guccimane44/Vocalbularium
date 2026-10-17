import assert from 'node:assert/strict';
import pg from 'pg';
import test, { createTestApplication, createTestDatabase } from './helpers/database.mjs';
import { legacyDatabase, migrateTo, populateKarteSchema } from './helpers/legacy-database.mjs';
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

  await migrateTo(t, database, 4);

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

  // After the remaining migrations, the owner is still signed in and sees an empty account.
  await migrateDatabase(database.databaseUrl);
  const [current] = (await client.query('SELECT id FROM decks')).rows;
  const application = await createTestApplication(t, { databaseKey: key, outbox: null });
  const url = await application.start({ port: 0 });
  const account = await fetch(url + '/api/account', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(account.status, 200);
  const body = await account.json();
  assert.equal(body.defaultDeckId, current.id);
  assert.equal(body.decks.length, 1); assert.deepEqual(body.pages, []);
  await application.close();
});

test('a new database gets exactly one default deck, created by the store', async t => {
  const database = await createTestDatabase(t);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  assert.equal((await client.query('SELECT count(*)::int AS n FROM decks')).rows[0].n, 0, 'the migrations create no deck without an account');
  const store = await AccountStore.open(database); database.resources.push(store);
  const decks = (await store.account()).decks;
  assert.equal(decks.length, 1);
  assert.deepEqual(decks[0].modules.map(({ type, facets }) => [type, facets]),
    [['main-key', undefined], ['context', undefined], ['german', ['article', 'examples', 'synonyms', 'antonyms']]], 'My Deck since 0.7.0 (D08)');
  assert.equal((await client.query('SELECT count(*)::int AS n FROM decks')).rows[0].n, 1);
});

// A small 0.4.x account (schema 0005–0007): one deck with modules, a captured
// page with components, a generation run, and receipts.
async function populatePageSchema(client) {
  await client.query(`
    INSERT INTO decks (id, name) VALUES ('deck', 'My Deck'), ('other', 'Other');
    INSERT INTO account VALUES (1, 'deck');
    INSERT INTO installations VALUES ('upgrade-installation', 1, 'browser');
    INSERT INTO credentials VALUES ('admin', 'salt', 'hash', 1);
    INSERT INTO login_tokens VALUES ('token', 99999999999999, 1);
    INSERT INTO deck_modules VALUES ('examples', 'deck', 0, 'german-examples');
    INSERT INTO pages (id, deck_id, selected_text, created_at) VALUES ('page', 'deck', '幸福', '1');
    INSERT INTO components (page_id, id, kind, module_instance_id, position, content, status) VALUES
      ('page', 'key', 'main_key', NULL, 0, '{"version":1,"blocks":[{"type":"paragraph","text":"幸福"}]}', NULL),
      ('page', 'explanation', 'module', 'examples', 1, '{"version":1,"blocks":[]}', 'completed');
    INSERT INTO generation_runs (id, page_id) VALUES ('run', 'page');
    INSERT INTO component_attempts (id, page_id, component_id, run_id, installation_id, session_id, epoch, module, state)
      VALUES ('attempt', 'page', 'explanation', 'run', 'upgrade-installation', 'browser', 1, '{"id":"examples","type":"german-examples"}', 'completed');
    INSERT INTO receipts (operation_id, fingerprint, result) VALUES ('op', 'f', '{}');`);
}

test('0006 retires <The selected> and its language-tag variant, deleting only their components', async t => {
  const database = await legacyDatabase(t, 'retire-selected', 5);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  await populatePageSchema(client);
  // Rows the 0.4.1 API could create: a configured <The selected>, and a component whose
  // <The selected + original language tag> instance was already removed from the deck.
  await client.query(`
    INSERT INTO deck_modules VALUES ('retired-selected', 'deck', 1, 'selected'), ('retired-language', 'deck', 2, 'selected-language');
    INSERT INTO components (page_id, id, kind, module_instance_id, position, content, status) VALUES
      ('page', 'selected-component', 'module', 'retired-selected', 10, '{"version":1,"blocks":[]}', 'completed'),
      ('page', 'orphan-component', 'module', 'long-removed', 11, '{"version":1,"blocks":[]}', 'completed');
    INSERT INTO component_attempts (id, page_id, component_id, run_id, installation_id, session_id, epoch, module, state)
      VALUES ('orphan-attempt', 'page', 'orphan-component', 'run', 'upgrade-installation', 'browser', 1,
        '{"id":"long-removed","type":"selected-language"}', 'completed');`);

  await migrateTo(t, database, 6);

  assert.deepEqual((await client.query("SELECT type FROM deck_modules WHERE deck_id = 'deck' ORDER BY position")).rows, [{ type: 'german-examples' }]);
  assert.deepEqual((await client.query("SELECT id FROM components WHERE page_id = 'page' ORDER BY position")).rows.map(row => row.id), ['key', 'explanation']);
  assert.deepEqual((await client.query('SELECT id FROM component_attempts')).rows, [{ id: 'attempt' }]);
});

test('0008 discards 0.4.x decks and pages, keeps sign-in, and starts one fresh My Deck with input modules', async t => {
  const database = await legacyDatabase(t, 'page-owned-upgrade', 7);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  await populatePageSchema(client);
  const kept = {};
  for (const table of ['credentials', 'login_tokens', 'installations']) kept[table] = await rows(client, table);

  await migrateTo(t, database, 8);

  for (const table of Object.keys(kept)) assert.deepEqual(await rows(client, table), kept[table], table);
  for (const table of ['pages', 'components', 'generation_runs', 'component_attempts', 'receipts']) {
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0, table);
  }
  const decks = (await client.query('SELECT id, name FROM decks')).rows;
  assert.equal(decks.length, 1); assert.equal(decks[0].name, 'My Deck'); assert.ok(!['deck', 'other'].includes(decks[0].id));
  assert.deepEqual((await client.query('SELECT default_deck_id FROM account')).rows, [{ default_deck_id: decks[0].id }]);
  assert.deepEqual((await client.query('SELECT position, type FROM deck_modules ORDER BY position')).rows,
    [{ position: 0, type: 'main-key' }, { position: 1, type: 'context' }, { position: 2, type: 'german-examples' }]);
  const columns = async table => (await client.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table])).rows.map(row => row.column_name);
  assert.ok(!(await columns('decks')).includes('capture_context'));
  assert.ok(!(await columns('components')).includes('kind'));

  // The upgraded account works through the store, with the later migrations applied.
  await migrateDatabase(database.databaseUrl);
  const store = await AccountStore.open(database); database.resources.push(store);
  const session = { installationId: 'upgrade-installation', sessionId: 'browser', epoch: 1 };
  const { pageId } = await store.capture('capture', { session, mainKey: '幸福', context: 'Wir sind 幸福.', snapshot: await store.snapshot() });
  assert.deepEqual((await store.page(pageId)).components.map(component => component.moduleType), ['main-key', 'context', 'german']);
});

test('0009 adds an empty deck colour and keeps every deck, page and sign-in', async t => {
  const database = await legacyDatabase(t, 'deck-colour-upgrade', 8);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  await client.query(`INSERT INTO decks (id, name) VALUES ('deck', 'Chinese');
    INSERT INTO account VALUES (1, 'deck');
    INSERT INTO deck_modules VALUES ('key', 'deck', 0, 'main-key'), ('notes', 'deck', 1, 'text');`);
  const kept = {};
  for (const table of ['account', 'deck_modules', 'credentials', 'login_tokens', 'installations', 'pages', 'components']) kept[table] = await rows(client, table);

  await migrateTo(t, database, 9);

  for (const table of Object.keys(kept)) assert.deepEqual(await rows(client, table), kept[table], table);
  assert.deepEqual((await client.query('SELECT id, name, colour FROM decks')).rows, [{ id: 'deck', name: 'Chinese', colour: null }]);
  await assert.rejects(client.query("UPDATE decks SET colour = 'teal'"), /deck_colour/);
  // The store needs 0010's columns; 0011 would discard this deck.
  await migrateTo(t, database, 10);

  const store = await AccountStore.open(database); database.resources.push(store);
  assert.equal((await store.deck('deck')).colour, null, 'an upgraded deck keeps its derived colour');
  await store.saveDeck('colour', { deck: { ...(await store.deck('deck')), colour: 'roots' } });
  assert.equal((await store.deck('deck')).colour, 'roots');
});

test('0010 adds empty facet lists and run order, and keeps every deck, page, run and sign-in', async t => {
  const database = await legacyDatabase(t, 'parent-facets-upgrade', 9);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  await client.query(`INSERT INTO decks (id, name) VALUES ('deck', 'Chinese');
    INSERT INTO account VALUES (1, 'deck');
    INSERT INTO deck_modules VALUES ('key', 'deck', 0, 'main-key'), ('examples', 'deck', 1, 'german-examples');
    INSERT INTO pages (id, deck_id, selected_text, created_at) VALUES ('page', 'deck', '幸福', '2026-10-13T10:00:00.000Z');
    INSERT INTO components (page_id, id, module_instance_id, module_type, position, content, status)
      VALUES ('page', 'key', 'k', 'main-key', 0, '{"version":1,"blocks":[{"type":"paragraph","text":"幸福"}]}', NULL),
        ('page', 'explanation', 'e', 'german-examples', 1, '{"version":1,"blocks":[{"type":"paragraph","text":"Glück"}]}', 'completed');
    INSERT INTO generation_runs (id, page_id, interpretation) VALUES ('run', 'page', '{"inputType":"word_phrase","sourceLanguage":"Chinesisch"}');`);
  const before = {};
  for (const table of ['account', 'decks', 'deck_modules', 'pages', 'components', 'generation_runs']) before[table] = await rows(client, table);

  await migrateTo(t, database, 10);

  const withoutAdded = list => list.map(row => { const { facets, ordinal, ...rest } = JSON.parse(row); return JSON.stringify(rest); }).sort();
  for (const table of Object.keys(before)) assert.deepEqual(withoutAdded(await rows(client, table)), withoutAdded(before[table]), table);
  assert.deepEqual((await client.query('SELECT facets FROM deck_modules')).rows.map(row => row.facets), [[], []]);
  assert.deepEqual((await client.query('SELECT facets FROM components')).rows.map(row => row.facets), [[], []]);
  assert.equal((await client.query('SELECT ordinal FROM generation_runs')).rows.length, 1);

  const store = await AccountStore.open(database); database.resources.push(store);
  assert.deepEqual((await store.deck('deck')).modules, [{ id: 'key', type: 'main-key' }, { id: 'examples', type: 'german-examples' }],
    'earlier modules keep their shape');
  assert.equal((await store.page('page')).interpretation, 'word_phrase', 'the page reports its latest interpretation');
});

test('0011 retires the earlier modules: discards decks and pages, keeps sign-in, and starts My Deck with German and its facets', async t => {
  const database = await legacyDatabase(t, 'retire-modules-upgrade', 10);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  await client.query(`INSERT INTO decks (id, name) VALUES ('deck', 'Chinese'), ('other', 'Other');
    INSERT INTO account VALUES (1, 'deck');
    INSERT INTO installations VALUES ('upgrade-installation', 1, 'browser');
    INSERT INTO credentials VALUES ('admin', 'salt', 'hash', 1);
    INSERT INTO login_tokens VALUES ('token', 99999999999999, 1);
    INSERT INTO deck_modules (id, deck_id, position, type) VALUES ('key', 'deck', 0, 'main-key'), ('examples', 'deck', 1, 'german-examples'),
      ('other-key', 'other', 0, 'main-key'), ('usage', 'other', 1, 'sentence-usage');
    INSERT INTO pages (id, deck_id, selected_text, created_at) VALUES ('page', 'deck', '幸福', '2026-10-13T10:00:00.000Z');
    INSERT INTO components (page_id, id, module_instance_id, module_type, position, content, status)
      VALUES ('page', 'key', 'k', 'main-key', 0, '{"version":1,"blocks":[{"type":"paragraph","text":"幸福"}]}', NULL),
        ('page', 'explanation', 'e', 'german-examples', 1, '{"version":1,"blocks":[{"type":"paragraph","text":"Glück"}]}', 'completed');
    INSERT INTO generation_runs (id, page_id, interpretation) VALUES ('run', 'page', '{"inputType":"word_phrase","sourceLanguage":"Chinesisch"}');
    INSERT INTO receipts (operation_id, fingerprint, result) VALUES ('old-operation', 'f', '{}');`);
  const kept = {};
  for (const table of ['credentials', 'login_tokens', 'installations']) kept[table] = await rows(client, table);

  await migrateDatabase(database.databaseUrl);

  for (const table of Object.keys(kept)) assert.deepEqual(await rows(client, table), kept[table], table);
  for (const table of ['pages', 'components', 'generation_runs', 'component_attempts', 'receipts']) {
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0, table);
  }
  const decks = (await client.query('SELECT id, name FROM decks')).rows;
  assert.equal(decks.length, 1); assert.equal(decks[0].name, 'My Deck'); assert.ok(!['deck', 'other'].includes(decks[0].id));
  assert.deepEqual((await client.query('SELECT default_deck_id FROM account')).rows, [{ default_deck_id: decks[0].id }]);
  assert.deepEqual((await client.query('SELECT position, type, facets FROM deck_modules ORDER BY position')).rows, [
    { position: 0, type: 'main-key', facets: [] }, { position: 1, type: 'context', facets: [] },
    { position: 2, type: 'german', facets: ['article', 'examples', 'synonyms', 'antonyms'] }]);

  const store = await AccountStore.open(database); database.resources.push(store);
  const session = { installationId: 'upgrade-installation', sessionId: 'browser', epoch: 1 };
  const { pageId } = await store.capture('capture', { session, mainKey: '幸福', snapshot: await store.snapshot() });
  const german = (await store.page(pageId)).components.find(component => component.moduleType === 'german');
  assert.deepEqual(german.facets, ['article', 'examples', 'synonyms', 'antonyms']);
});

test('0012 starts structured parent content: discards 0.7.3 decks and pages with their markup, keeps sign-in, and starts My Deck again', async t => {
  const database = await legacyDatabase(t, 'structured-content-upgrade', 11);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  await client.query(`INSERT INTO decks (id, name, colour) VALUES ('deck', 'Bank words', 'roots');
    INSERT INTO account VALUES (1, 'deck');
    INSERT INTO installations VALUES ('upgrade-installation', 1, 'browser');
    INSERT INTO credentials VALUES ('admin', 'salt', 'hash', 1);
    INSERT INTO login_tokens VALUES ('token', 99999999999999, 1);
    INSERT INTO deck_modules (id, deck_id, position, type, facets) VALUES ('key', 'deck', 0, 'main-key', '{}'), ('german', 'deck', 1, 'german', '{article,examples}');
    INSERT INTO pages (id, deck_id, selected_text, created_at) VALUES ('page', 'deck', 'bank', '2026-10-16T10:00:00.000Z');
    INSERT INTO components (page_id, id, module_instance_id, module_type, position, content, status, facets)
      VALUES ('page', 'key', 'k', 'main-key', 0, '{"version":1,"blocks":[{"type":"paragraph","text":"bank"}]}', NULL, '{}'),
        ('page', 'german', 'g', 'german', 1, '{"version":1,"blocks":[{"type":"paragraph","text":"== Englisch (bank) ==\\n=== Bedeutungen ===\\n: [1] Ufer"}]}', 'completed', '{article,examples}');
    INSERT INTO generation_runs (id, page_id, interpretation) VALUES ('run', 'page', '{"inputType":"word_phrase"}');
    INSERT INTO receipts (operation_id, fingerprint, result) VALUES ('old-operation', 'f', '{}');`);
  const kept = {};
  for (const table of ['credentials', 'login_tokens', 'installations']) kept[table] = await rows(client, table);

  await migrateDatabase(database.databaseUrl);

  for (const table of Object.keys(kept)) assert.deepEqual(await rows(client, table), kept[table], table);
  for (const table of ['pages', 'components', 'generation_runs', 'component_attempts', 'receipts']) {
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0, table);
  }
  const decks = (await client.query('SELECT id, name, colour FROM decks')).rows;
  assert.equal(decks.length, 1); assert.equal(decks[0].name, 'My Deck'); assert.notEqual(decks[0].id, 'deck');
  assert.equal(decks[0].colour, null, 'the new My Deck takes its derived colour');
  assert.deepEqual((await client.query('SELECT default_deck_id FROM account')).rows, [{ default_deck_id: decks[0].id }]);
  assert.deepEqual((await client.query('SELECT position, type, facets FROM deck_modules ORDER BY position')).rows, [
    { position: 0, type: 'main-key', facets: [] }, { position: 1, type: 'context', facets: [] },
    { position: 2, type: 'german', facets: ['article', 'examples', 'synonyms', 'antonyms'] }]);

  const store = await AccountStore.open(database); database.resources.push(store);
  const session = { installationId: 'upgrade-installation', sessionId: 'browser', epoch: 1 };
  const { pageId } = await store.capture('capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  assert.equal((await store.page(pageId)).components.find(component => component.moduleType === 'german').status, 'loading');
});

test('0014 and its one-time conversions turn the main key’s drawn emphasis into stored highlights and Context and Text into markdown, once, keeping everything else', async t => {
  const database = await legacyDatabase(t, 'key-highlights-upgrade', 13);
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  t.after(() => client.end());
  const parent = facets => JSON.stringify({ version: 1, blocks: [{ type: 'parent', header: { kind: 'word', language: 'Englisch', key: 'bank' }, core: '1. Ufer', facets }] });
  await client.query(`INSERT INTO decks (id, name) VALUES ('deck', 'Bank words');
    INSERT INTO account VALUES (1, 'deck');
    INSERT INTO deck_modules (id, deck_id, position, type, facets) VALUES ('key', 'deck', 0, 'main-key', '{}'), ('german', 'deck', 1, 'german', '{examples}');
    INSERT INTO pages (id, deck_id, selected_text, created_at) VALUES ('page', 'deck', 'bank', '2026-10-17T10:00:00.000Z');`);
  await client.query(`INSERT INTO components (page_id, id, module_instance_id, module_type, position, content, status, facets) VALUES
    ('page', 'key', 'k', 'main-key', 0, '{"version":1,"blocks":[{"type":"paragraph","text":"bank"}]}', NULL, '{}'),
    ('page', 'german', 'g', 'german', 1, $1, 'completed', '{examples}'),
    ('page', 'context', 'c', 'context', 2, '{"version":1,"blocks":[{"type":"paragraph","text":"by the bank"}]}', NULL, '{}'),
    ('page', 'text', 't', 'text', 3, '{"version":1,"blocks":[{"type":"paragraph","text":"- 2*3 is a bank sum"}]}', NULL, '{}')`,
  [parent({ examples: '1. We sat on the Bank.\n   *Wir saßen am Ufer.*' })]);
  const content = async id => (await client.query('SELECT content FROM components WHERE id = $1', [id])).rows[0].content;

  await migrateDatabase(database.databaseUrl);
  assert.equal(await content('german'), parent({ examples: '1. We sat on the ==Bank==.\n   *Wir saßen am Ufer.*' }), 'the main key highlighted where the card drew it');
  assert.equal(await content('key'), '{"version":1,"blocks":[{"type":"paragraph","text":"bank"}]}', 'the main key itself stays');
  assert.equal(await content('context'), '{"version":1,"blocks":[{"type":"paragraph","text":"by the ==bank=="}]}', 'Context becomes markdown, the main key highlighted');
  assert.equal(await content('text'), '{"version":1,"blocks":[{"type":"paragraph","text":"\\\\- 2\\\\*3 is a bank sum"}]}', 'Text kept as typed: escaped, and no highlight');
  assert.deepEqual((await client.query('SELECT name FROM data_migrations ORDER BY name')).rows, [{ name: '0.7.5-main-key-highlights' }, { name: '0.7.5-notes-markdown' }]);

  // Once only: a highlight the user removed afterwards stays removed.
  await client.query('UPDATE components SET content = $1 WHERE id = $2', [parent({ examples: '1. We sat on the Bank.' }), 'german']);
  await migrateDatabase(database.databaseUrl);
  assert.equal(await content('german'), parent({ examples: '1. We sat on the Bank.' }));
});
