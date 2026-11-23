// A card's own facet order (D26, 0.16.1): a facet's tag and title drag it among the
// card's facets, with the pointer or the keyboard; the tags follow, and the
// order is saved for that card.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staged } from '../helpers/pages.mjs';
import { BANK, componentArticle, dragKey, launch, signIn, waitFor } from './helpers.mjs';

test('facet order: a facet’s tag drags it among its card’s facets by pointer or keyboard, the tags follow, and the order is saved', { timeout: 60000 }, async (t) => {
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

  // No grip: the facet's tag and title are its handle, named for the move, with the grab hand.
  const grip = facet => card.locator(`.facet[data-facet="${facet}"] .facet-handle`);
  const last = saved.at(-1);
  assert.equal(await card.locator('.facet-grip, .six-dots').count(), 0, 'no six dots');
  assert.match(await grip(last).getAttribute('aria-label'), /^Move .+ from German$/);
  assert.equal(await grip(last).evaluate(node => getComputedStyle(node).cursor), 'grab');
  assert.ok((await grip(last).boundingBox()).height >= 22, 'the tag is the target');
  // The facet's actions show only while its tag or its actions are pointed at, not the rest of its line.
  const actions = facet => card.locator(`.facet[data-facet="${facet}"] .facet-actions button`).first();
  const line = await card.locator(`.facet[data-facet="${last}"] .facet-title`).boundingBox();
  await a.page.mouse.move(line.x + line.width * 0.6, line.y + line.height / 2);
  await a.page.waitForTimeout(400);
  assert.equal(await actions(last).evaluate(node => getComputedStyle(node).opacity), '0', 'the empty line shows nothing');
  await grip(last).hover();
  await waitFor(async () => await actions(last).evaluate(node => getComputedStyle(node).opacity) === '1', 'the tag shows the actions');

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
  await grip(last).focus();
  await dragKey(a.page, 'Space');
  await dragKey(a.page, 'ArrowDown');
  await a.page.keyboard.press('Space');
  const stepped = [moved[1], moved[0], ...moved.slice(2)];
  await waitFor(async () => JSON.stringify((await german()).facets) === JSON.stringify(stepped), 'the keyboard move saved');
  // Escape puts a picked-up facet back.
  await grip(stepped[0]).focus();
  await dragKey(a.page, 'Space');
  await dragKey(a.page, 'ArrowDown');
  await dragKey(a.page, 'Escape');
  assert.deepEqual((await german()).facets, stepped, 'Escape moves nothing');

  // The order is the card's own: it stays after a reload, and the content is unchanged.
  await a.page.reload();
  await card.locator('.facet').first().waitFor();
  assert.deepEqual(await sections(), stepped);
  assert.deepEqual(await tags(), stepped);
  assert.deepEqual((await german()).content, published, 'only the order changed');
});
