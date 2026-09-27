import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/app.mjs';
import { loadConfig } from '../src/server/config.mjs';

async function fixture(t, options) {
  const application = createApplication(options);
  const url = await application.start({ port: 0 });
  t.after(() => application.close());
  return { application, url };
}
async function call(url, path, body, token, headers = {}) {
  const response = await fetch(url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}
const login = async url => (await call(url, '/api/login', { username: 'admin', password: 'admin' })).data.token;

test('account data is unavailable before login and credentials are checked', async t => {
  const { url, application } = await fixture(t);
  assert.equal((await call(url, '/api/account')).status, 401);
  assert.equal((await call(url, '/api/login', { username: 'admin', password: 'wrong' })).status, 401);
  assert.equal((await call(url, '/api/login', { username: 'other', password: 'admin' })).status, 401);
  const token = await login(url);
  const result = await call(url, '/api/account', undefined, token);
  assert.equal(result.status, 200);
  assert.equal(result.data.decks.length, 1);
  assert.equal(result.data.decks[0].name, 'My Deck');
  assert.equal(result.data.defaultDeckId, result.data.decks[0].id);
  const saved = application.store.db.prepare('SELECT * FROM login_tokens').get();
  assert.notEqual(saved.hash, token);
});

test('two installations share one account; logout revokes only the current login', async t => {
  const { url } = await fixture(t);
  const a = await login(url), b = await login(url);
  assert.notEqual(a, b);
  assert.deepEqual((await call(url, '/api/account', undefined, a)).data, (await call(url, '/api/account', undefined, b)).data);
  assert.equal((await call(url, '/api/logout', {}, a)).status, 200);
  assert.equal((await call(url, '/api/account', undefined, a)).status, 401);
  assert.equal((await call(url, '/api/account', undefined, b)).status, 200);
});

test('expired login tokens stop granting access', async t => {
  let time = 1000;
  const { url } = await fixture(t, { authOptions: { lifetimeMs: 50, clock: () => time } });
  const token = await login(url);
  time = 1050;
  assert.equal((await call(url, '/api/account', undefined, token)).status, 401);
});

test('ordered account writes and uncertain resubmission work across authenticated clients', async t => {
  const { url, application } = await fixture(t);
  const a = await login(url), b = await login(url);
  const first = application.store.snapshot();
  const second = application.store.createDeck('Second deck');
  const saveA = await call(url, '/api/default-deck', { operationId: 'a', deckId: second.id }, a);
  const saveB = await call(url, '/api/default-deck', { operationId: 'b', deckId: first.id }, b);
  assert.ok(saveA.data.sequence < saveB.data.sequence);
  const repeated = await call(url, '/api/default-deck', { deckId: second.id, operationId: 'a' }, a);
  assert.equal(repeated.data.replayed, true);
  assert.equal((await call(url, '/api/account', undefined, a)).data.defaultDeckId, first.id);
});

test('database and valid logins survive an account-server restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-account-'));
  let application = createApplication({ filename: join(directory, 'account.sqlite') });
  t.after(async () => { await application.close(); await rm(directory, { recursive: true, force: true }); });
  let url = await application.start({ port: 0 });
  const token = await login(url);
  const before = (await call(url, '/api/account', undefined, token)).data;
  await application.close();
  application = createApplication({ filename: join(directory, 'account.sqlite') });
  url = await application.start({ port: 0 });
  assert.deepEqual((await call(url, '/api/account', undefined, token)).data, before);
});

test('invalid commands and untrusted webpage origins cannot alter account data', async t => {
  const { url } = await fixture(t);
  const token = await login(url);
  assert.equal((await call(url, '/api/default-deck', { operationId: 'bad' }, token)).status, 400);
  assert.equal((await call(url, '/api/session', {}, token)).status, 400);
  assert.equal((await call(url, '/api/account', undefined, token, { Origin: 'https://example.com' })).status, 403);
  const account = await call(url, '/api/account', undefined, token);
  assert.equal(account.data.decks.length, 1);
});

test('nested malformed commands return validation errors without a partial write', async t => {
  const { url, application } = await fixture(t);
  const token = await login(url);
  const before = application.store.account();
  const deckId = before.defaultDeckId;
  const cardId = application.store.createManual('malformed-fixture-card', { deckId, pages: [] }).cardId;
  const baseline = application.store.account();
  for (const [path, payload] of [
    ['/api/deck/save', { deck: { id: deckId, name: 'Changed', pages: [null] } }],
    ['/api/card/create', { deckId, pages: [null] }],
    ['/api/card/create', { deckId, pages: [false] }],
    ['/api/card/save', { cardId, changes: [null] }],
    ['/api/capture', { session: { installationId: 'x', sessionId: 'y', epoch: 1 }, selectedText: 'text', snapshot: { id: deckId, pages: [null] } }]
  ]) {
    const result = await call(url, path, { operationId: crypto.randomUUID(), payload }, token);
    assert.equal(result.status, 400, `${path}: ${JSON.stringify(result.data)}`);
    assert.equal(result.data.code, 'invalid');
    assert.deepEqual(application.store.account(), baseline);
  }
});

test('Fastify publishes route contracts and request IDs on health responses', async t => {
  const { url, application } = await fixture(t);
  const live = await fetch(url + '/health/live');
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { ok: true });
  assert.match(live.headers.get('x-request-id'), /^[\da-f-]{36}$/);
  assert.deepEqual(await (await fetch(url + '/health/ready')).json(), { ok: true });

  const document = await application.openapi();
  assert.equal(document.info.version, '0.3.0');
  assert.ok(document.paths['/api/capture'].post.requestBody.content['application/json'].schema.properties.payload);
  assert.deepEqual(document.paths['/api/capture'].post.security, [{ bearerAuth: [] }]);
  assert.deepEqual(document.paths['/api/login'].post.security, []);
  assert.ok(document.paths['/api/capture'].post.responses['400'].content['application/json'].schema);
});

test('startup configuration rejects invalid ports and log levels before listening', () => {
  const config = loadConfig({ PORT: '0', HOST: '127.0.0.1', DATA_DIR: '.data-test', LOG_LEVEL: 'debug' });
  assert.equal(config.port, 0);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.logLevel, 'debug');
  assert.ok(config.directory.endsWith('.data-test'));
  assert.throws(() => loadConfig({ PORT: '4318junk' }), /Invalid PORT/);
  assert.throws(() => loadConfig({ PORT: '65536' }), /Invalid PORT/);
  assert.throws(() => loadConfig({ LOG_LEVEL: 'verbose' }), /Invalid LOG_LEVEL/);
});
