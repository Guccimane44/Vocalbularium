import test, { createTestStore, createTestApplication } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { sortPages as sortSummaries } from '../extension/sorting.ts';
import { component, text, textBlocks } from './helpers/pages.mjs';

// The extension's list ordering, applied to full pages by their main key.
const sortPages = (pages, order) => sortSummaries(pages.map(page => ({ id: page.id, createdAt: page.createdAt,
  mainKey: text(component(page, 'main-key')) })), order);

test('bounded page lists preserve JavaScript ordering by main key, ties, and cursor validity', async t => {
  const store = await createTestStore(t);
  const deck = await store.snapshot();
  const contentMarker = 'page-content-sentinel:abc';
  const samples = ['~', 'A', 'ａ', 'Ä', '😀', '', 'abc', 'Z', 'key'];
  for (let index = 0; index < 64; index++) {
    await store.createPage(`seed-${index}`, { deckId: deck.id, mainKey: samples[index % samples.length],
      initial: [{ moduleInstanceId: deck.modules.find(module => module.type === 'context').id, content: textBlocks(contentMarker) }] });
  }
  const summary = await store.summary();
  assert.equal(summary.decks[0].pageCount, 64);
  assert.equal(summary.defaultDeckSnapshot.id, deck.id);
  assert.equal(JSON.stringify(summary).includes(contentMarker), false, 'account summary has no page content');
  const all = await store.pages();
  for (const order of ['newest', 'oldest', 'az', 'za']) {
    const collected = [];
    let cursor;
    do {
      const result = await store.listPages(deck.id, { order, cursor, limit: 7 });
      assert.ok(result.pages.length <= 7);
      assert.equal(JSON.stringify(result).includes(contentMarker), false, 'list rows contain only main-key summaries');
      collected.push(...result.pages.map(page => page.id));
      cursor = result.nextCursor;
    } while (cursor);
    assert.deepEqual(collected, sortPages(all, order).map(page => page.id), order);
  }
  const first = await store.listPages(deck.id, { order: 'az', limit: 5 });
  await store.savePage('change-key', { pageId: all[0].id, changes: [{ componentId: component(all[0], 'main-key').id, content: textBlocks('0-new-first') }] });
  await assert.rejects(store.listPages(deck.id, { order: 'az', limit: 5, cursor: first.nextCursor }), error => error.code === 'stale_cursor');
  const listed = await store.listPages(deck.id, { order: 'az', limit: 1 });
  assert.equal(listed.pages[0].id, sortPages(await store.pages(), 'az')[0].id);
  assert.equal(listed.pages[0].mainKey, '0-new-first');
});

test('deck lists and recent captures remain bounded as the account grows', async t => {
  const store = await createTestStore(t);
  const initial = await store.snapshot();
  for (let index = 0; index < 55; index++) await store.createDeck(`Deck ${index}`);
  const first = await store.summary();
  assert.equal(first.decks.length, 40);
  assert.ok(first.nextCursor);
  const rest = await store.listDecks({ cursor: first.nextCursor });
  assert.equal(rest.decks.length, 16);
  assert.equal(rest.nextCursor, null);
  const session = { installationId: 'reads-installation', sessionId: 'reads-session', epoch: 1 };
  await store.openSession('reads-session-open', session);
  for (let index = 0; index < 25; index++) await store.capture(`capture-${index}`, {
    session, mainKey: `word-${index}`, snapshot: initial
  });
  await store.createPage('manual-not-recent', { deckId: initial.id, mainKey: 'manual' });
  const recent = await store.recentCaptures();
  assert.equal(recent.pages.length, 20);
  const captured = (await store.pages()).filter(page => page.selectedText !== null);
  assert.deepEqual(recent.pages.map(page => page.id), sortPages(captured, 'newest').slice(0, 20).map(page => page.id));
  assert.ok(recent.pages.every(page => page.mainKey.startsWith('word-') && !Object.hasOwn(page, 'components')));
});

test('bounded read routes require login and reject oversized lists and stale cursors', async t => {
  const application = await createTestApplication(t);
  const url = await application.start({ port: 0 });
  const request = async (path, token) => {
    const response = await fetch(url + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await request('/api/account/summary')).status, 401);
  const login = await fetch(url + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }) });
  const { token } = await login.json();
  const summary = await request('/api/account/summary', token);
  assert.equal(summary.status, 200);
  assert.equal(summary.data.decks.length, 1);
  assert.equal(summary.data.defaultDeckSnapshot.id, summary.data.defaultDeckId);
  const deckId = summary.data.defaultDeckId;
  const pageId = (await application.store.createPage('read-route-page', { deckId, mainKey: 'Example' })).pageId;
  await application.store.createPage('read-route-page-two', { deckId, mainKey: 'Second' });
  assert.equal((await request(`/api/decks/${deckId}`, token)).data.id, deckId);
  const page = (await request(`/api/pages/${pageId}`, token)).data;
  assert.equal(text(component(page, 'main-key')), 'Example');
  const listed = await request(`/api/decks/${deckId}/pages?limit=1`, token);
  assert.equal(listed.data.pages.length, 1);
  assert.ok(['Example', 'Second'].includes(listed.data.pages[0].mainKey));
  assert.ok(listed.data.nextCursor);
  await application.store.savePage('read-route-edit', { pageId, changes: [{ componentId: component(page, 'main-key').id, content: textBlocks('Updated') }] });
  assert.equal((await request(`/api/decks/${deckId}/pages?limit=1&cursor=${encodeURIComponent(listed.data.nextCursor)}`, token)).status, 409);
  assert.equal((await request('/api/decks?limit=51', token)).status, 400);
  assert.equal((await request(`/api/decks/${deckId}/pages?order=unknown`, token)).status, 400);
  assert.equal((await request('/api/captures/recent', token)).status, 200);
  for (const retired of [`/api/decks/${deckId}/kartes`, `/api/kartes/${pageId}`, `/api/cards/${pageId}`]) {
    assert.equal((await request(retired, token)).status, 404, retired);
  }
  await application.close();
});
