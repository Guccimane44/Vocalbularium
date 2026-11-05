// Decks keep the order their owner gives them (D27, 0.16.2): a deck's card on
// Home drags by its body, a sidebar row drags too, each by pointer or keyboard,
// and either list follows the other; the order is saved for the account.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, signIn, waitFor } from './helpers.mjs';

test('deck order: drag a card on Home, move a sidebar row by keyboard and by pointer; both lists follow and the order stays', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-deck-order-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1000 });
  const store = application.store;
  await store.createDeck('Second');
  await store.createDeck('Third');
  await signIn(a.page);
  const saved = async () => (await store.listDecks()).decks.map(deck => deck.name);
  const home = () => a.page.locator('.deck-slot h2').allTextContents();
  const sidebar = () => a.page.locator('.nav-decks .nav-label').allTextContents();
  const pause = () => new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(await home(), ['My Deck', 'Second', 'Third']);

  // Home: Third dragged by its body onto My Deck's place.
  const card = name => a.page.locator('.deck-slot').filter({ has: a.page.getByRole('heading', { name, exact: true }) }).locator('.open');
  const from = await card('Third').boundingBox(), to = await card('My Deck').boundingBox();
  await a.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(from.x + from.width / 2 - 10, from.y + from.height / 2, { steps: 4 });
  await a.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 16 });
  await a.page.mouse.up();
  await waitFor(async () => JSON.stringify(await saved()) === JSON.stringify(['Third', 'My Deck', 'Second']), 'the card move saved');
  await waitFor(async () => JSON.stringify(await sidebar()) === JSON.stringify(['Third', 'My Deck', 'Second']), 'the sidebar follows');
  assert.match(new URL(a.page.url()).hash, /^#?$/, 'a drag opens no deck');

  // Sidebar, keyboard: Space picks Second up, Arrow Up twice, Space drops it.
  const row = name => a.page.locator('.nav-decks a').filter({ hasText: name });
  await row('Second').focus();
  await a.page.keyboard.press('Space'); await pause();
  await a.page.keyboard.press('ArrowUp'); await pause();
  await a.page.keyboard.press('ArrowUp'); await pause();
  await a.page.keyboard.press('Space');
  await waitFor(async () => JSON.stringify(await saved()) === JSON.stringify(['Second', 'Third', 'My Deck']), 'the keyboard move saved');
  await waitFor(async () => JSON.stringify(await home()) === JSON.stringify(['Second', 'Third', 'My Deck']), 'Home follows');
  // Escape puts a picked-up row back.
  await row('Second').focus();
  await a.page.keyboard.press('Space'); await pause();
  await a.page.keyboard.press('ArrowDown'); await pause();
  await a.page.keyboard.press('Escape'); await pause();
  assert.deepEqual(await sidebar(), ['Second', 'Third', 'My Deck'], 'Escape moves nothing');
  assert.deepEqual(await saved(), ['Second', 'Third', 'My Deck']);

  // Sidebar, pointer: My Deck dragged above Second.
  const top = await row('Second').boundingBox(), mine = await row('My Deck').boundingBox();
  await a.page.mouse.move(mine.x + 40, mine.y + mine.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(mine.x + 40, mine.y + mine.height / 2 - 10, { steps: 4 });
  await a.page.mouse.move(mine.x + 40, top.y + 4, { steps: 12 });
  await a.page.mouse.up();
  await waitFor(async () => JSON.stringify(await saved()) === JSON.stringify(['My Deck', 'Second', 'Third']), 'the sidebar drag saved');
  assert.match(new URL(a.page.url()).hash, /^#?$/, 'the dragged row opens no deck');

  // The order is the account's: it stays after a reload.
  await a.page.reload();
  await a.page.locator('.deck-slot').first().waitFor();
  assert.deepEqual(await home(), ['My Deck', 'Second', 'Third']);
  assert.deepEqual(await sidebar(), ['My Deck', 'Second', 'Third']);
});
