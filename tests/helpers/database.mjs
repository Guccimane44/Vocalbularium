import test from 'node:test';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateDatabase } from '../../scripts/migrate.mjs';
import { AccountStore } from '../../src/core/store.mjs';
import { createApplication } from '../../src/server/app.mjs';

const fixtures = new WeakMap();
export async function createTestDatabase(t, key, { migrate = true } = {}) {
  let databases = fixtures.get(t);
  if (!databases) { databases = new Map(); fixtures.set(t, databases); }
  if (key && databases.has(key)) return databases.get(key);
  const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? 'postgresql://vocabularium_test@127.0.0.1:5432/postgres');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname) || adminUrl.pathname !== '/postgres') {
    throw new Error('Tests require a loopback postgres maintenance URL; development databases cannot be reset.');
  }
  const name = `vocabularium_test_${randomBytes(12).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect();
  try { await admin.query(`CREATE DATABASE "${name}"`); } finally { await admin.end(); }
  const url = new URL(adminUrl); url.pathname = `/${name}`;
  // A keyed store's generation outbox is temporary, like its database, never in the checkout.
  const outbox = join(tmpdir(), `${name}.generation-outbox`);
  let removed = false;
  const cleanup = async () => {
    if (removed) return;
    const connection = new pg.Client({ connectionString: adminUrl.href });
    await connection.connect();
    // Plain DROP stops autovacuum workers itself and waits for closing sessions. FORCE needs
    // pg_signal_backend to terminate an autovacuum worker, so it only handles leaked sessions.
    try {
      try { await connection.query(`DROP DATABASE "${name}"`); }
      catch (error) {
        if (error.code !== '55006') throw error;
        await connection.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      }
      removed = true;
    } finally { await connection.end(); }
    await rm(outbox, { recursive: true, force: true });
  };
  // The databaseTest wrapper registers final cleanup after user cleanup hooks.
  const database = { databaseUrl: url.href, outbox, cleanup, resources: [] };
  databases.set(key ?? name, database);
  try { if (migrate) await migrateDatabase(url.href); } catch (error) { await cleanup(); throw error; }
  return database;
}
export async function createTestStore(t, databaseKey) {
  const database = await createTestDatabase(t, databaseKey);
  const store = await AccountStore.open({ databaseUrl: database.databaseUrl, outbox: databaseKey ? database.outbox : undefined });
  database.resources.push(store);
  return store;
}
export async function createTestApplication(t, { databaseKey, ...options } = {}) {
  const database = await createTestDatabase(t, databaseKey);
  const unavailable = async () => { throw new Error('Controlled provider is unavailable.'); };
  const application = await createApplication({ provider: { generate: unavailable },
    ...options, databaseUrl: database.databaseUrl,
    outbox: options.outbox === null ? undefined : databaseKey ? database.outbox : undefined });
  database.resources.push(application);
  if (process.env.TEST_API_PORT) {
    const start = application.start.bind(application);
    application.start = options => start({ port: Number(process.env.TEST_API_PORT), ...options });
  }
  return application;
}

export default function databaseTest(name, options, body) {
  if (typeof options === 'function') { body = options; options = {}; }
  return test(name, options, async t => {
    try { await body(t); }
    finally {
      t.after(async () => {
        for (const database of fixtures.get(t)?.values() ?? []) {
          try { for (const resource of database.resources) await resource.close(); }
          finally { await database.cleanup(); }
        }
      });
    }
  });
}
