import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { parseEnv } from 'node:util';
import { migrateDatabase } from './migrate.mjs';

const adminUrl = process.env.POSTGRES_ADMIN_URL ?? `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/postgres`;
const target = new URL(adminUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.pathname !== '/postgres') {
  throw new Error('Local setup requires the loopback postgres maintenance database.');
}
let saved;
try { saved = parseEnv(await readFile('.env.postgres', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const roles = ['vocabularium_migrator', 'vocabularium_app', 'vocabularium_test'];
const keys = ['MIGRATION_DATABASE_URL', 'DATABASE_URL', 'TEST_DATABASE_ADMIN_URL'];
const urls = Object.fromEntries(keys.map((key, index) => {
  if (saved?.[key]) return [key, saved[key]];
  const url = new URL(adminUrl);
  url.username = roles[index]; url.password = randomBytes(24).toString('hex');
  url.pathname = index === 2 ? '/postgres' : '/vocabularium_dev';
  return [key, url.href];
}));
for (const [index, key] of keys.entries()) {
  if (saved && !saved[key]) throw new Error('Existing .env.postgres is incomplete; inspect it before setup.');
  const url = new URL(urls[key]);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== target.hostname ||
      (url.port || '5432') !== (target.port || '5432') || url.username !== roles[index] ||
      url.pathname !== (index === 2 ? '/postgres' : '/vocabularium_dev')) {
    throw new Error('Existing .env.postgres does not match the dedicated local resources; refusing changes.');
  }
}
const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
try {
  for (const [index, role] of roles.entries()) {
    const existing = (await admin.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname = $1', [role])).rows[0];
    if (existing) {
      if (!saved || existing.rolsuper || existing.rolcreaterole || !existing.rolcanlogin || existing.rolcreatedb !== (index === 2)) {
        throw new Error(`Existing role ${role} needs manual inspection; setup will not replace it.`);
      }
    } else {
      // Names are fixed constants; generated passwords are hex, never user SQL.
      const password = new URL(urls[keys[index]]).password;
      if (!/^[a-f0-9]{48}$/.test(password)) throw new Error('Invalid generated setup credential.');
      await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEROLE ${index === 2 ? 'CREATEDB' : 'NOCREATEDB'} PASSWORD '${password}'`);
    }
  }
  const database = (await admin.query("SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = 'vocabularium_dev'")).rows[0];
  if (database && database.owner !== 'vocabularium_migrator') throw new Error('Existing development database has a different owner; refusing changes.');
  if (!database) await admin.query('CREATE DATABASE vocabularium_dev OWNER vocabularium_migrator');
  await admin.query('REVOKE ALL ON DATABASE vocabularium_dev FROM PUBLIC');
  await admin.query('GRANT CONNECT ON DATABASE vocabularium_dev TO vocabularium_app');
  if (!saved) await writeFile('.env.postgres', Object.entries(urls).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
} finally { await admin.end(); }
await migrateDatabase(urls.MIGRATION_DATABASE_URL);
const migration = new pg.Client({ connectionString: urls.MIGRATION_DATABASE_URL });
await migration.connect();
try {
  await migration.query('GRANT USAGE ON SCHEMA public TO vocabularium_app');
  await migration.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vocabularium_app');
  await migration.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vocabularium_app');
  await migration.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vocabularium_app');
  await migration.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO vocabularium_app');
} finally { await migration.end(); }
console.log('Local PostgreSQL development database migrated. Connection settings saved in ignored .env.postgres (mode 0600).');
