import test from 'node:test';
import assert from 'node:assert/strict';
import { captureMenu, captureMenuTitle } from '../extension/context-menu.js';

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
const accountNamed = name => ({ defaultDeckId: 'one', decks: [{ id: 'one', name }], cards: [] });

test('capture menu: safe names, missing default, and an existing item after worker restart', async () => {
  const api = menuAPI();
  const sync = captureMenu(api);
  for (const name of ['My Deck', '“幸福” — Grüße', 'A'.repeat(250), '%s and %%s']) {
    await sync(accountNamed(name));
    assert.equal(api.items.size, 1);
    const title = api.items.get('capture').title;
    assert.equal(title.replaceAll('\u200b', ''), `Create a card in “${name}”`);
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
  let account = accountNamed('My Deck'), accountFetch, sessionCalls = 0;
  globalThis.fetch = async url => {
    const path = new URL(url).pathname;
    if (path === '/api/session') sessionCalls++;
    const value = path === '/api/login' ? { token: 'test-token' } : path === '/api/account' ? await (accountFetch ? accountFetch() : structuredClone(account)) : {};
    return { ok: true, async json() { return value; } };
  };
  t.after(() => { globalThis.chrome = oldChrome; globalThis.fetch = oldFetch; });
  await import(`../extension/background.js?test=${crypto.randomUUID()}`);
  const send = message => new Promise(resolve => api.runtime.onMessage.listeners[0](message, { id: 'test', url: api.runtime.getURL('app.html') }, resolve));
  return { api, send, rename(name) { account = accountNamed(name); }, hold(fn) { accountFetch = fn; }, get sessionCalls() { return sessionCalls; } };
}

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
