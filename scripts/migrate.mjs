import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { frontSortKey } from '../src/core/sort-key.mjs';

export async function migrateDatabase(databaseUrl) {
  if (!databaseUrl) throw new Error('Set MIGRATION_DATABASE_URL for schema migrations.');
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000, lock_timeout: 3000, statement_timeout: 30_000 });
  await client.connect();
  try {
    // Same owner lock as the API: schema changes require the API to be stopped.
    const result = await client.query('SELECT pg_try_advisory_lock(172910, 1) AS owned');
    if (!result.rows[0].owned) throw new Error('Stop the API before running migrations.');
    await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
    // The key must use JavaScript's NFKC/lowercase and UTF-16 comparison, so a
    // PostgreSQL lower()/collation backfill would give different page order.
    let afterId = '';
    while (true) {
      const { rows } = await client.query(`SELECT c.id, COALESCE(p.text, '') AS front_text
        FROM kartes c LEFT JOIN layout_seites l ON l.deck_id = c.deck_id AND l.position = 0
        LEFT JOIN seites p ON p.karte_id = c.id AND p.seite_id = l.id
        WHERE c.id > $1 ORDER BY c.id LIMIT 500`, [afterId]);
      if (!rows.length) break;
      await client.query('BEGIN');
      try {
        for (const row of rows) await client.query('UPDATE kartes SET front_sort_key = $1 WHERE id = $2', [frontSortKey(row.front_text), row.id]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      afterId = rows.at(-1).id;
    }
  } finally { await client.end(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrateDatabase(process.env.MIGRATION_DATABASE_URL);
  console.log('PostgreSQL migrations applied.');
}
