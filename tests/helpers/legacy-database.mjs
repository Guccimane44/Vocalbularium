// Deliberate legacy fixtures: applied migrations and receipt fingerprints are
// part of the upgrade contract, not current product vocabulary.
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createTestDatabase } from './database.mjs';

export function oldFingerprint(kind, payload) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(canonical([kind, payload]))).digest('hex');
}
export async function legacyDatabase(t, key, last = 1) {
  const database = await createTestDatabase(t, key, { migrate: false });
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
  return database;
}
