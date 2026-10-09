// Deliberate legacy fixtures: applied migrations are part of the upgrade
// contract, not current product vocabulary.
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createTestDatabase } from './database.mjs';

// Applies the reviewed migrations up to and including journal index `last`.
export async function migrateTo(t, database, last) {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-old-schema-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'meta'));
  const journal = JSON.parse(await readFile(new URL('../../migrations/meta/_journal.json', import.meta.url), 'utf8'));
  journal.entries = journal.entries.filter(entry => entry.idx <= last);
  await writeFile(join(directory, 'meta/_journal.json'), JSON.stringify(journal));
  for (const entry of journal.entries) await cp(new URL(`../../migrations/${entry.tag}.sql`, import.meta.url), join(directory, `${entry.tag}.sql`));
  const client = new pg.Client({ connectionString: database.databaseUrl }); await client.connect();
  try { await migrate(drizzle(client), { migrationsFolder: directory }); }
  finally { await client.end(); }
}
export async function legacyDatabase(t, key, last = 1) {
  const database = await createTestDatabase(t, key, { migrate: false });
  await migrateTo(t, database, last);
  return database;
}

// A small 0.3.0+ (schema 0002) account: two decks, captured and manual kartes,
// a staged attempt, and receipts. Credentials are left to the caller.
export async function populateKarteSchema(client) {
  await client.query(`
    INSERT INTO decks (id, name) VALUES ('deck-a', 'My Deck'), ('deck-b', 'Chinese');
    INSERT INTO account VALUES (1, 'deck-b');
    INSERT INTO layout_seites VALUES ('front-a', 'deck-a', 0, '[{"id":"m1","type":"selected"}]'),
      ('back-a', 'deck-a', 1, '[{"id":"m2","type":"german-examples"}]'), ('front-b', 'deck-b', 0, '[]');
    INSERT INTO installations VALUES ('installation', 1, 'browser');
    INSERT INTO kartes (id, deck_id, selected_text, created_at) VALUES ('captured', 'deck-a', '幸福', '1'), ('manual', 'deck-b', NULL, '2');
    INSERT INTO seites VALUES ('captured', 'front-a', '幸福', 'completed', 'attempt-front'),
      ('captured', 'back-a', '', 'loading', 'attempt-back'), ('manual', 'front-b', 'manual text', NULL, NULL);
    INSERT INTO attempts (id, karte_id, seite_id, installation_id, session_id, epoch, modules, state, result) VALUES
      ('attempt-front', 'captured', 'front-a', 'installation', 'browser', 1, '[]', 'completed', NULL),
      ('attempt-back', 'captured', 'back-a', 'installation', 'browser', 1, '[]', 'loading', '{"ok":true,"text":"staged"}');
    INSERT INTO receipts (operation_id, fingerprint, result) VALUES ('old-capture', 'fingerprint', '{"karteId":"captured"}');
  `);
}
