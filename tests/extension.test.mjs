import test from 'node:test';
import assert from 'node:assert/strict';
import { captureMenu, captureMenuTitle } from '../extension/context-menu.js';
import { captureRuntime } from '../extension/capture.js';

function menuAPI() {
  const items = new Map();
  const runtime = {};
  const fail = callback => { runtime.lastError = { message: 'Cannot find menu item' }; callback(); delete runtime.lastError; };
  return { items, runtime, contextMenus: {
    create(item, callback) { assert.equal(items.has(item.id), false); items.set(item.id, item); callback(); },
    update(id, value, callback) { if (!items.has(id)) return fail(callback); items.set(id, { ...items.get(id), ...value }); callback(); },
    removeAll(callback) { items.clear(); callback(); }
  } };
}
const accountNamed = name => ({ defaultDeckId: 'one', decks: [{ id: 'one', name, modules: [] }] });

test('capture menu: safe names, missing default, and an existing item after worker restart', async () => {
  const api = menuAPI();
  const sync = captureMenu(api);
  for (const name of ['My Deck', '“幸福” — Grüße', 'A'.repeat(250), '%s and %%s']) {
    await sync(accountNamed(name));
    assert.equal(api.items.size, 1);
    const title = api.items.get('capture').title;
    assert.equal(title.replaceAll('\u200b', ''), `Create a page in “${name}”`);
    assert.equal(title.includes('%s'), false, 'selection cannot be substituted into a deck name');
  }
  await captureMenu(api)(accountNamed('After restart'));
  assert.equal(api.items.size, 1);
  assert.equal(api.items.get('capture').title, captureMenuTitle('After restart'));
  await sync({ defaultDeckId: 'missing', decks: [] });
  assert.equal(api.items.size, 0);
});

function storage() {
  const data = {};
  return {
    data,
    async get(keys) { return structuredClone(keys == null ? data : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]]))); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; },
    async setAccessLevel(value) { assert.equal(value.accessLevel, 'TRUSTED_CONTEXTS'); }
  };
}
function event() { return { listeners: [], addListener(fn) { this.listeners.push(fn); } }; }
async function background(t) {
  const api = menuAPI();
  Object.assign(api.runtime, { id: 'test', getURL: path => `chrome-extension://test/${path}`, onMessage: event(), onInstalled: event(), onStartup: event() });
  api.contextMenus.onClicked = event();
  api.storage = { local: storage(), session: storage(), onChanged: event() };
  api.alarms = { async create() {}, onAlarm: event() }; api.action = { onClicked: event() };
  const oldChrome = globalThis.chrome, oldFetch = globalThis.fetch;
  globalThis.chrome = api;
  let account = accountNamed('My Deck'), accountFetch, intercept, sessionCalls = 0;
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    const overridden = await intercept?.(path, options);
    if (overridden) return overridden;
    if (path === '/api/session') sessionCalls++;
    const value = path === '/api/login' ? { token: 'test-token' }
      : path === '/api/account/summary' ? await (accountFetch ? accountFetch() : structuredClone(account))
        : path === '/api/captures/recent' ? { pages: [] } : {};
    return { ok: true, async json() { return value; } };
  };
  t.after(() => { globalThis.chrome = oldChrome; globalThis.fetch = oldFetch; });
  await import(`../extension/background.js?test=${crypto.randomUUID()}`);
  const send = message => new Promise(resolve => api.runtime.onMessage.listeners[0](message, { id: 'test', url: api.runtime.getURL('app.html') }, resolve));
  return { api, send, rename(name) { account = accountNamed(name); }, hold(fn) { accountFetch = fn; }, intercept(fn) { intercept = fn; }, get sessionCalls() { return sessionCalls; } };
}

const reply = (status, value) => ({ ok: status >= 200 && status < 300, status, async json() { return value; } });

test('account refresh clears only confirmed, unchanged saved capture receipts', async t => {
  const fixture = await background(t);
  const { api, send } = fixture;
  await send({ type: 'login', username: 'admin', password: 'admin' });
  await api.storage.local.set({
    'capture-recent': { state: 'saved', pageId: 'recent-page' },
    'capture-race': { state: 'saved', pageId: 'race-page' },
    'capture-pending': { state: 'pending', pageId: 'pending-page' }
  });
  fixture.intercept(async path => {
    if (path === '/api/captures/recent') return reply(200, { pages: [{ id: 'recent-page' }] });
    if (path === '/api/pages/race-page') {
      await api.storage.local.set({ 'capture-race': { state: 'pending', pageId: 'race-page' } });
      return reply(200, { id: 'race-page' });
    }
  });
  await send({ type: 'refresh' });
  assert.equal(api.storage.local.data['capture-recent'], undefined);
  assert.equal(api.storage.local.data['capture-race'].state, 'pending');
  assert.equal(api.storage.local.data['capture-pending'].state, 'pending');
});

test('a capture wakeup during an ending poll starts a fresh result check', async t => {
  const prior = globalThis.chrome;
  const local = storage(), session = storage();
  await local.set({ auth: { token: 'test-token' } });
  await session.set({ session: { sessionId: 'browser-session' } });
  globalThis.chrome = { storage: { local, session } };
  t.after(() => { globalThis.chrome = prior; });
  let releaseFirst, signalFirst;
  const firstStarted = new Promise(resolve => { signalFirst = resolve; });
  let checks = 0;
  const runtime = captureRuntime({
    initialize: async () => ({ signedIn: true }),
    request: async path => {
      assert.equal(path, '/api/poll');
      checks++;
      if (checks === 1) { signalFirst(); await new Promise(resolve => { releaseFirst = resolve; }); }
      return { loading: false, ready: [] };
    },
    refresh: async () => {}, removeAccess: async () => {},
    saves: { perform: async () => {}, recordPending: async () => {} }
  });
  const first = runtime.poll();
  await firstStarted;
  const second = runtime.poll();
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(checks, 2, 'the later capture must not inherit an empty earlier result');
});

test('mutations report missing or expired access without clearing the original save receipt', async t => {
  const fixture = await background(t);
  const { api, send } = fixture;
  await send({ type: 'login', username: 'admin', password: 'admin' });
  const save = { type: 'save-page', operationId: 'auth-save', payload: { pageId: 'one', changes: [] } };
  await api.storage.local.remove('auth');
  assert.equal((await send(save)).code, 'unauthorized');
  assert.equal(api.storage.local.data['save-auth-save'], undefined);
  await send({ type: 'login', username: 'admin', password: 'admin' });
  fixture.intercept(path => path === '/api/page/save' ? reply(401, { error: 'Sign in to continue.', code: 'unauthorized' }) : null);
  assert.equal((await send(save)).code, 'unauthorized');
  assert.equal(api.storage.local.data['save-auth-save'].state, 'pending');
  assert.deepEqual(api.storage.local.data['save-auth-save'].payload.payload, save.payload);
  assert.equal(api.storage.local.data.auth, undefined);
});

test('a busy or unconfirmed Retry is answered in place, not a pending save to resubmit', async t => {
  const fixture = await background(t);
  const { api, send } = fixture;
  await send({ type: 'login', username: 'admin', password: 'admin' });
  let attempts = 0, body;
  fixture.intercept((path, options) => {
    if (path !== '/api/page/generate') return null;
    attempts++; body = JSON.parse(options.body);
    return body.payload.confirmation
      ? reply(429, { error: 'Generation is busy. Try again later.', code: 'generation_busy' })
      : reply(409, { error: 'Retry replaces this content.', code: 'confirmation_required', details: { confirmation: 'digest' } });
  });
  const target = { scope: 'component', componentId: 'component' };
  const unconfirmed = await send({ type: 'generate-page', operationId: 'ask', payload: { pageId: 'page', target } });
  assert.equal(unconfirmed.code, 'confirmation_required');
  assert.deepEqual(unconfirmed.details, { confirmation: 'digest' });
  assert.deepEqual(body.payload.session, api.storage.session.data.session, 'generation runs in this browser session');
  const busy = await send({ type: 'generate-page', operationId: 'busy-retry', payload: { pageId: 'page', target, confirmation: 'digest' } });
  assert.equal(busy.code, 'generation_busy');
  assert.equal(api.storage.local.data['save-ask'], undefined);
  assert.equal(api.storage.local.data['save-busy-retry'], undefined);
  await send({ type: 'try-saving-again', operationId: 'busy-retry' });
  assert.equal(attempts, 2, 'a recovery action cannot silently start generation');
});

test('the first start after a model upgrade discards old content and keeps sign-in', async t => {
  const fixture = await background(t);
  const { api, send } = fixture;
  const auth = { token: 'test-token' };
  await api.storage.local.set({ auth, installationId: 'installation', epoch: 3, theme: 'dark',
    account: { kartes: [] }, 'capture-old': { state: 'pending', payload: { selectedText: 'old' } },
    'save-old': { operationId: 'old', path: '/api/karte/save', payload: {} }, connectionError: 'old error' });
  fixture.intercept(path => path === '/api/poll' ? reply(200, { loading: false, ready: [] }) : null);
  const state = await send({ type: 'initialize' });
  assert.equal(state.signedIn, true);
  const data = api.storage.local.data;
  for (const key of ['capture-old', 'save-old', 'connectionError']) assert.equal(data[key], undefined, key);
  assert.deepEqual([data.auth, data.installationId, data.theme, data.dataVersion], [auth, 'installation', 'dark', 4]);
  assert.equal(data.epoch, 4, 'the installation keeps its identity and starts its next browser session');
  assert.ok(data.account.recentPages, 'the account is refreshed in the new shape');
  await api.storage.local.set({ 'save-new': { operationId: 'new', path: '/api/page/save', payload: {}, state: 'pending' } });
  await send({ type: 'initialize' });
  assert.ok(api.storage.local.data['save-new'], 'later data is kept');
  // Initialization also starts a result poll; let it finish before the fixture is torn down.
  await new Promise(resolve => setTimeout(resolve, 50));
});

test('authentication loss during refresh does not turn an acknowledged mutation into editor success', async t => {
  const fixture = await background(t);
  const { api, send } = fixture;
  await send({ type: 'login', username: 'admin', password: 'admin' });
  const operationId = 'committed-save';
  let committed = false;
  fixture.intercept(path => {
    if (path === '/api/page/save') { committed = true; return reply(200, { pageId: 'one' }); }
    if (path === '/api/account/summary' && committed) return reply(401, { error: 'Sign in to continue.', code: 'unauthorized' });
    return null;
  });
  const result = await send({ type: 'save-page', operationId, payload: { pageId: 'one', changes: [] } });
  assert.equal(committed, true);
  assert.equal(result.code, 'unauthorized');
  assert.equal(api.storage.local.data[`save-${operationId}`], undefined, 'acknowledged operation is not duplicated');
  assert.equal(api.storage.local.data.auth, undefined);
  fixture.intercept(null);
  await send({ type: 'login', username: 'admin', password: 'admin' });
  const replay = await send({ type: 'save-page', operationId, payload: { pageId: 'one', changes: [] } });
  assert.equal(replay.signedIn, true);
  assert.equal(api.storage.local.data[`save-${operationId}`], undefined);
});

test('account refresh: menu follows confirmed sync without replacing the session; late logout replies stay unavailable', async t => {
  const fixture = await background(t);
  const { api, send } = fixture;
  await send({ type: 'login', username: 'admin', password: 'admin' });
  const session = structuredClone(api.storage.session.data.session);
  fixture.rename('Renamed on another installation');
  await send({ type: 'refresh' });
  assert.equal(api.items.get('capture').title, captureMenuTitle('Renamed on another installation'));
  assert.deepEqual(api.storage.session.data.session, session);
  assert.equal(fixture.sessionCalls, 1);
  let release, started;
  const waiting = new Promise(resolve => { started = resolve; });
  fixture.hold(() => new Promise(resolve => { release = resolve; started(); }));
  const refresh = send({ type: 'refresh' }); await waiting;
  await send({ type: 'logout' });
  release(accountNamed('Stale reply'));
  assert.equal((await refresh).signedIn, false);
  assert.equal(api.storage.local.data.auth, undefined);
  assert.equal(api.storage.local.data.account, undefined);
  assert.equal(api.items.size, 0);
});

test('account refresh: overlapping requests apply in order and retain the latest name', async t => {
  const fixture = await background(t);
  await fixture.send({ type: 'login' });
  let release, started, calls = 0;
  const waiting = new Promise(resolve => { started = resolve; });
  fixture.hold(() => ++calls === 1 ? new Promise(resolve => { release = resolve; started(); }) : accountNamed('Newest name'));
  const first = fixture.send({ type: 'refresh' }); await waiting;
  const second = fixture.send({ type: 'refresh' });
  release(accountNamed('Older name'));
  await Promise.all([first, second]);
  assert.equal(fixture.api.storage.local.data.account.decks[0].name, 'Newest name');
  assert.equal(fixture.api.items.get('capture').title, captureMenuTitle('Newest name'));
});

test('save receipts: active work stays distinct from failure, and retry preserves the operation', async () => {
  const { saveOperations } = await import('../extension/save-operations.js');
  const local = storage(), receipt = { operationId: 'one', path: '/api/publish', payload: { operationId: 'one', payload: { attemptId: 'attempt' } } };
  let release, calls = 0;
  const saves = saveOperations({ storage: local, request: async (path, payload) => {
    calls++; assert.equal(path, receipt.path); assert.deepEqual(payload, receipt.payload);
    return new Promise((resolve, reject) => { release = { resolve, reject }; });
  } });
  await saves.recover();
  const attempt = saves.perform(receipt, 'token');
  assert.equal(saves.perform(receipt, 'token'), attempt, 'overlapping retry shares the active request');
  while (!release) await Promise.resolve();
  assert.equal(local.data['save-one'].state, 'saving');
  await saves.recover(); await saves.recordPending(receipt);
  assert.equal(local.data['save-one'].state, 'saving', 'polling and reinitialization do not expose an active save as failed');
  release.reject(Error('network failed'));
  await assert.rejects(attempt, /network failed/);
  assert.equal(local.data['save-one'].state, 'pending');
  release = undefined;
  const retry = saves.perform(local.data['save-one'], 'token');
  while (!release) await Promise.resolve();
  assert.equal(local.data['save-one'].state, 'saving');
  release.resolve({ saved: true });
  assert.deepEqual(await retry, { saved: true });
  assert.equal(local.data['save-one'], undefined);
  assert.equal(calls, 2);
});

test('save receipts: a new worker recovers interrupted saves and preserves other records', async () => {
  const { saveOperations } = await import('../extension/save-operations.js');
  const local = storage();
  const receipt = { operationId: 'interrupted', path: '/api/page/save', payload: { operationId: 'interrupted', payload: { text: 'draft' } }, state: 'saving' };
  const legacy = { operationId: 'legacy', path: '/api/default-deck', payload: { operationId: 'legacy', deckId: 'deck' } };
  await local.set({ 'save-interrupted': receipt, 'save-legacy': legacy, 'capture-one': { state: 'saving' } });
  let calls = 0;
  const restarted = saveOperations({ storage: local, request: async (path, payload) => {
    calls++; assert.equal(path, receipt.path); assert.deepEqual(payload, receipt.payload); return { ok: true };
  } });
  await restarted.recover();
  assert.equal(calls, 0, 'interruption does not automatically resubmit work');
  assert.deepEqual(local.data['save-interrupted'], { ...receipt, state: 'pending' });
  assert.deepEqual(local.data['save-legacy'], legacy);
  assert.equal(local.data['capture-one'].state, 'saving', 'capture interruption keeps its own existing rules');
  await restarted.perform(local.data['save-interrupted'], 'token');
  assert.equal(calls, 1);
  assert.equal(local.data['save-interrupted'], undefined);
});

test('save receipts: rejected edits discard only the existing non-retryable validation errors', async () => {
  const { saveOperations } = await import('../extension/save-operations.js');
  const local = storage();
  const saves = saveOperations({ storage: local, request: async () => { throw Object.assign(Error('Choose supported modules'), { code: 'invalid' }); } });
  await assert.rejects(saves.perform({ operationId: 'edit', path: '/api/deck/save', payload: {} }, 'token', ['invalid']), /Choose supported modules/);
  assert.equal(local.data['save-edit'], undefined);
});
