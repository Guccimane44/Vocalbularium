// A card's own facet order (D26, 0.16.1): a facet's grip drags it among the
// card's facets, with the pointer or the keyboard; the tags follow, and the
// order is saved for that card.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staged } from '../helpers/pages.mjs';
import { BANK, componentArticle, launch, signIn, waitFor } from './helpers.mjs';

test('facet order: a grip drags a facet among its card’s facets by pointer or keyboard, the tags follow, and the order is saved', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-order-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facet-order', epoch: 1 };
  await store.openSession('facet-order-session', session);
  const { pageId } = await store.capture('facet-order-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = () => store.page(pageId).then(page => page.components.find(item => item.moduleType === 'german'));
  const first = await german();
  await store.stage(first.attemptId, staged(BANK));
  await store.publish('facet-order-publish', { attemptId: first.attemptId, session });
  const { facets: saved, content: published } = await german();
  assert.ok(saved.length >= 3, 'the card has facets to reorder');
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  await card.locator('.facet').first().waitFor();
  const sections = () => card.locator('.entry-content > .facet').evaluateAll(nodes => nodes.map(node => node.dataset.facet));
  const tags = () => card.locator('.facet-tags .facet-tag:not([data-leaving])').evaluateAll(nodes => nodes.map(node => node.dataset.facet));
  assert.deepEqual(await sections(), saved, 'the card shows its facets in its order');
  assert.deepEqual(await tags(), saved);

  // At rest the grips are hidden; hovering a facet shows its grip, named for the facet and the card.
  const grip = facet => card.locator(`.facet[data-facet="${facet}"] .facet-grip`);
  const last = saved.at(-1);
  await a.page.mouse.move(5, 5);
  assert.equal(await grip(last).evaluate(node => getComputedStyle(node).opacity), '0');
  await card.locator(`.facet[data-facet="${last}"]`).hover();
  await waitFor(async () => await grip(last).evaluate(node => getComputedStyle(node).opacity) === '1', 'the grip shows on hover');
  assert.match(await grip(last).getAttribute('aria-label'), /^Move .+ from German$/);
  // The grip sits in the card's margin, before the facet's tab, so showing it moves nothing.
  const gripBox = await grip(last).boundingBox(), tabBox = await card.locator(`.facet[data-facet="${last}"] .facet-tab`).boundingBox();
  assert.ok(gripBox.x + gripBox.width <= tabBox.x + 1, 'the grip stands before the tab');
  assert.ok(gripBox.width >= 24 && gripBox.height >= 24, 'a 24 px target');

  // Pointer: the last facet dragged above the first.
  const from = await grip(last).boundingBox();
  await a.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 4 });
  const target = await card.locator(`.facet[data-facet="${saved[0]}"]`).boundingBox();
  await a.page.mouse.move(from.x + from.width / 2, target.y + 4, { steps: 12 });
  await a.page.mouse.up();
  const moved = [last, ...saved.slice(0, -1)];
  await waitFor(async () => JSON.stringify((await german()).facets) === JSON.stringify(moved), 'the pointer move saved');
  await waitFor(async () => JSON.stringify(await sections()) === JSON.stringify(moved), 'the sections in the new order');
  await waitFor(async () => JSON.stringify(await tags()) === JSON.stringify(moved), 'the tags follow');

  // Keyboard: Space picks the first facet up, Arrow Down moves it one place, Space drops it.
  // The sensor needs a moment after each key, as for the cards.
  const pause = () => new Promise(resolve => setTimeout(resolve, 300));
  await grip(last).focus();
  await a.page.keyboard.press('Space'); await pause();
  await a.page.keyboard.press('ArrowDown'); await pause();
  await a.page.keyboard.press('Space');
  const stepped = [moved[1], moved[0], ...moved.slice(2)];
  await waitFor(async () => JSON.stringify((await german()).facets) === JSON.stringify(stepped), 'the keyboard move saved');
  // Escape puts a picked-up facet back.
  await grip(stepped[0]).focus();
  await a.page.keyboard.press('Space'); await pause();
  await a.page.keyboard.press('ArrowDown'); await pause();
  await a.page.keyboard.press('Escape'); await pause();
  assert.deepEqual((await german()).facets, stepped, 'Escape moves nothing');

  // The order is the card's own: it stays after a reload, and the content is unchanged.
  await a.page.reload();
  await card.locator('.facet').first().waitFor();
  assert.deepEqual(await sections(), stepped);
  assert.deepEqual(await tags(), stepped);
  assert.deepEqual((await german()).content, published, 'only the order changed');
  await a.page.screenshot({ path: 'artifacts/v0.16.1-facet-order.png', animations: 'disabled' });
});
