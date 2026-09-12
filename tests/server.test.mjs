import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../src/server/app.mjs';

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
