import test from 'node:test';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { migrateDatabase } from '../../scripts/migrate.mjs';
import { AccountStore } from '../../src/core/store.mjs';
import { createApplication } from '../../src/server/app.mjs';

const fixtures = new WeakMap();
export async function createTestDatabase(t, key) {
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
  let removed = false;
  const cleanup = async () => {
    if (removed) return;
    const connection = new pg.Client({ connectionString: adminUrl.href });
    await connection.connect();
    try { await connection.query(`DROP DATABASE "${name}" WITH (FORCE)`); removed = true; }
    finally { await connection.end(); }
  };
  // The databaseTest wrapper registers final cleanup after user cleanup hooks.
  const database = { databaseUrl: url.href, cleanup, resources: [] };
  databases.set(key ?? name, database);
  try { await migrateDatabase(url.href); } catch (error) { await cleanup(); throw error; }
  return database;
}
export async function createTestStore(t, databaseKey) {
  const database = await createTestDatabase(t, databaseKey);
  const store = await AccountStore.open({ databaseUrl: database.databaseUrl, outbox: databaseKey ? `${databaseKey}.generation-outbox` : undefined });
  database.resources.push(store);
  return store;
}
export async function createTestApplication(t, { databaseKey, ...options } = {}) {
  const database = await createTestDatabase(t, databaseKey);
  const unavailable = async () => { throw new Error('Controlled provider is unavailable.'); };
  const application = await createApplication({ provider: { interpret: unavailable, generate: unavailable },
    ...options, databaseUrl: database.databaseUrl,
    outbox: options.outbox === null ? undefined : databaseKey ? `${databaseKey}.generation-outbox` : undefined });
  database.resources.push(application);
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
