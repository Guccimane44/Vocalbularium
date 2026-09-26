import test, { createTestStore, createTestApplication } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { sortCards } from '../extension/sorting.ts';

test('bounded card pages preserve JavaScript ordering, ties, and cursor validity', async t => {
  const store = await createTestStore(t);
  const deck = await store.snapshot();
  const front = deck.pages[0].id;
  const samples = ['', 'A', 'ａ', 'Ä', '😀', '\uE000', 'abc', 'Z'];
  for (let index = 0; index < 64; index++) {
    await store.createManual(`seed-${index}`, { deckId: deck.id, pages: [{ pageId: front, text: samples[index % samples.length] }] });
  }
  const summary = await store.summary();
  assert.equal(summary.decks[0].cardCount, 64);
  assert.equal(summary.defaultDeckSnapshot.id, deck.id);
  assert.equal(JSON.stringify(summary).includes('abc'), false, 'account summary has no card content');
  const all = await store.cards();
  for (const order of ['newest', 'oldest', 'az', 'za']) {
    const collected = [];
    let cursor;
    do {
      const result = await store.listCards(deck.id, { order, cursor, limit: 7 });
      assert.ok(result.cards.length <= 7);
      assert.ok(result.cards.every(card => card.pages.length === 1), 'list rows contain only front-page summaries');
      collected.push(...result.cards.map(card => card.id));
      cursor = result.nextCursor;
    } while (cursor);
    assert.deepEqual(collected, sortCards(all, order).map(card => card.id), order);
  }
  const first = await store.listCards(deck.id, { order: 'az', limit: 5 });
  await store.savePages('change-front', { cardId: all[0].id, changes: [{ pageId: front, text: '0-new-first' }] });
  await assert.rejects(store.listCards(deck.id, { order: 'az', limit: 5, cursor: first.nextCursor }), error => error.code === 'stale_cursor');
  assert.equal((await store.card(all[0].id)).pages[0].text, '0-new-first');
  assert.equal((await store.listCards(deck.id, { order: 'az', limit: 1 })).cards[0].id,
    sortCards(await store.cards(), 'az')[0].id);
});

test('deck pages and recent captures remain bounded as the account grows', async t => {
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
    session, selectedText: `word-${index}`, snapshot: initial
  });
  const recent = await store.recentCaptures();
  assert.equal(recent.cards.length, 20);
  assert.deepEqual(recent.cards.map(card => card.id), sortCards(await store.cards(), 'newest').slice(0, 20).map(card => card.id));
  assert.ok(recent.cards.every(card => card.pages.length === 1));
});

test('bounded read routes require login and reject oversized pages and stale cursors', async t => {
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
  const cardId = (await application.store.createManual('read-route-card', {
    deckId, pages: [{ pageId: summary.data.defaultDeckSnapshot.pages[0].id, text: 'Example' }]
  })).cardId;
  await application.store.createManual('read-route-card-two', {
    deckId, pages: [{ pageId: summary.data.defaultDeckSnapshot.pages[0].id, text: 'Second' }]
  });
  assert.equal((await request(`/api/decks/${deckId}`, token)).data.id, deckId);
  assert.equal((await request(`/api/cards/${cardId}`, token)).data.pages[0].text, 'Example');
  const page = await request(`/api/decks/${deckId}/cards?limit=1`, token);
  assert.equal(page.data.cards.length, 1);
  assert.ok(['Example', 'Second'].includes(page.data.cards[0].pages[0].text));
  assert.ok(page.data.nextCursor);
  await application.store.savePages('read-route-edit', { cardId,
    changes: [{ pageId: summary.data.defaultDeckSnapshot.pages[0].id, text: 'Updated' }] });
  assert.equal((await request(`/api/decks/${deckId}/cards?limit=1&cursor=${encodeURIComponent(page.data.nextCursor)}`, token)).status, 409);
  assert.equal((await request('/api/decks?limit=51', token)).status, 400);
  assert.equal((await request(`/api/decks/${deckId}/cards?order=unknown`, token)).status, 400);
  assert.equal((await request('/api/captures/recent', token)).status, 200);
  await application.close();
});
