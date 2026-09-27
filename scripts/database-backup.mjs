import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { access, writeFile } from 'node:fs/promises';
import pg from 'pg';

const [action, archive, name] = process.argv.slice(2);
if (!['backup', 'restore'].includes(action) || !archive) throw new Error('Use backup <archive> or restore <archive> <new vocabularium_restore_name>.');
const source = action === 'backup' ? process.env.MIGRATION_DATABASE_URL : process.env.TEST_DATABASE_ADMIN_URL;
if (!source) throw new Error('Load the local PostgreSQL environment before backup or restore.');
const url = new URL(source);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('This workflow is for local PostgreSQL only.');
if (action === 'restore') {
  if (!name || !/^vocabularium_restore_[a-z0-9_]{1,30}$/.test(name) || url.pathname !== '/postgres') {
    throw new Error('Restore requires a new vocabularium_restore_* database and the postgres maintenance URL; development/test databases cannot be reset.');
  }
  await access(resolve(archive));
  const client = new pg.Client({ connectionString: url.href }); await client.connect();
  try { await client.query(`CREATE DATABASE "${name}"`); } finally { await client.end(); }
  url.pathname = `/${name}`;
} else {
  await writeFile(resolve(archive), '', { flag: 'wx', mode: 0o600 });
}
const command = action === 'backup' ? 'pg_dump' : 'pg_restore';
const executable = process.env.PG_BIN ? join(process.env.PG_BIN, command) : command;
const environment = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432',
  PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) };
const args = action === 'backup' ? ['--format=custom', '--no-owner', '--no-acl', '--file', resolve(archive)]
  : ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname', environment.PGDATABASE, resolve(archive)];
const result = spawnSync(executable, args, { env: environment, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`${command} failed. A failed restore database is retained for inspection; it is never reset automatically.`);
console.log(action === 'backup' ? `Backup written to ${resolve(archive)}.` : `Restored to ${name}.`);
