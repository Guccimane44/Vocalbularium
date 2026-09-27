import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';

export async function migrateDatabase(databaseUrl) {
  if (!databaseUrl) throw new Error('Set MIGRATION_DATABASE_URL for schema migrations.');
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000, lock_timeout: 3000, statement_timeout: 30_000 });
  await client.connect();
  try {
    // Same owner lock as the API: schema changes require the API to be stopped.
    const result = await client.query('SELECT pg_try_advisory_lock(172910, 1) AS owned');
    if (!result.rows[0].owned) throw new Error('Stop the API before running migrations.');
    await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) });
  } finally { await client.end(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrateDatabase(process.env.MIGRATION_DATABASE_URL);
  console.log('PostgreSQL migrations applied.');
}
