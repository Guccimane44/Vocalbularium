// The catalogue of moves, each recorded frame by frame and checked by
// assertSmooth (motion.mjs): no row moves one way and then back, leaps, or
// vanishes and returns, and nothing that should never show is drawn. A new
// interaction that moves cards, rows or views adds its move here.
import test, { createTestApplication } from '../helpers/database.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staged, useModules } from '../helpers/pages.mjs';
import { BANK, cardButton, cardTab, chooseDeletePage, componentArticle, crumb, launch, openFamily, signIn, steps, waitFor, windowModule } from './helpers.mjs';
import { assertSmooth, watchMotion } from './motion.mjs';

// Cards on a page and modules in deck settings: each sortable row, named by its tab.
const CARDS = { rows: '.shaping-list .sortable-row', key: '.tab-label', box: '.card-tab' };
// The deck's page list, named by each page's main key.
const PAGE_ROWS = { rows: '.page-row', key: '.page-row-text a' };
// What a view must never draw on the way: an unavailable page (0.9.1), the empty
// deck's box or the loading line over a deck that has pages (0.16.1).
const NEVER = [{ selector: '#app h1', text: 'Page unavailable' }, { selector: '.empty' }, { selector: '.list-loading' }];

/** Drags `source` by the pointer onto `target`'s lower part, watching the rows while it moves and after the drop. */
async function dragWatched(page, source, target, label, { dragged, watch = CARDS }) {
  const from = await source.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 4 });
  // While it is dragged, the others make room in one direction each; the dragged row follows the pointer.
  const making = await watchMotion(page, { ...watch, flashes: NEVER, frames: 600 });
  const to = await target.boundingBox();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * 0.8, { steps: 16 });
  // Frames are recorded over a fixed span of the drag: time is what this checks.
  await new Promise(resolve => setTimeout(resolve, 400));
  const during = await making.stop();
  assertSmooth(during.map(frame => ({ ...frame, rows: Object.fromEntries(Object.entries(frame.rows).filter(([name]) => name !== dragged)) })),
    { label: `${label}, while dragged` });
  // From the drop, every row only moves on toward its place.
  const settling = await watchMotion(page, { ...watch, flashes: NEVER });
  await page.mouse.up();
  assertSmooth(await settling.finish(), { label: `${label}, after the drop` });
}

test('motion: the catalogue of moves draws no flicker, jump or flash', { timeout: 90000 }, async (t) => {
  const step = steps(t);
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-motion-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  // Tall enough that the module window and every card are on screen without scrolling.
  await a.page.setViewportSize({ width: 1280, height: 1500 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'motion', epoch: 1 };
  await store.openSession('motion-session', session);
  await useModules(store, ['context', 'text', 'german']);
  const deckId = (await store.snapshot()).id;
  const pages = [];
  for (const key of ['bank', 'river']) {
    const { pageId } = await store.capture(`motion-capture-${key}`, { session, mainKey: key, context: 'We sat on the bank.', snapshot: await store.snapshot() });
    const german = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
    await store.stage(german.attemptId, staged(BANK));
    await store.publish(`motion-publish-${key}`, { attemptId: german.attemptId, session });
    pages.push(pageId);
  }
  const types = async () => (await store.page(pages[0])).components.map(item => item.moduleType);
  await signIn(a.page);
  // The way a user gets there: the deck, then one of its pages.
  await a.page.goto(`chrome-extension://${a.id}/app.html#deck/${deckId}`);
  await a.page.locator('.page-row').first().waitFor();
  await a.page.locator('.page-row').filter({ hasText: 'bank' }).getByRole('link').first().click();
  await cardTab(a.page, 'German').waitFor();
  const settled = () => a.page.locator('.shaping-list').evaluate(list => Promise.all(list.getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  await settled();

  step('reorder a card by dragging');
  await dragWatched(a.page, cardTab(a.page, 'Text'), componentArticle(a.page, 'German'), 'Text dragged below German', { dragged: 'Text' });
  await waitFor(async () => JSON.stringify(await types()) === JSON.stringify(['main-key', 'context', 'german', 'text']), 'the reorder saved');
  await settled();

  step('add a module with the window\'s +');
  await openFamily(windowModule(a.page, 'chinese'));
  const adding = await watchMotion(a.page, { ...CARDS, flashes: NEVER });
  await a.page.locator('.window-module[data-type="chinese"]').getByRole('button', { name: 'Add Chinese at the end', exact: true }).click();
  assertSmooth(await adding.finish(), { label: 'Chinese added at the end', still: ['Context', 'German', 'Text'] });
  await waitFor(async () => (await types()).includes('chinese'), 'Chinese added');
  await settled();

  step('delete a card');
  await (await cardButton(a.page, 'Delete Context')).click();
  const deleting = await watchMotion(a.page, { ...CARDS, flashes: NEVER });
  await a.page.getByRole('button', { name: 'Yes, delete Context', exact: true }).click();
  assertSmooth(await deleting.finish(), { label: 'Context deleted' });
  await waitFor(async () => !(await types()).includes('context'), 'Context deleted');

  step('go back from a page to its deck');
  const back = await watchMotion(a.page, { ...PAGE_ROWS, flashes: NEVER });
  await crumb(a.page, 'My Deck').click();
  assertSmooth(await back.finish(), { label: 'back from the page to its deck', still: ['bank', 'river'] });

  step('delete a page');
  await a.page.locator('.page-row').filter({ hasText: 'river' }).getByRole('link').first().click();
  await cardTab(a.page, 'German').waitFor();
  await chooseDeletePage(a.page);
  const leaving = await watchMotion(a.page, { ...PAGE_ROWS, flashes: NEVER });
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete page', exact: true }).click();
  assertSmooth(await leaving.finish(), { label: 'a page deleted, back to its deck' });
  await a.page.locator('.page-row').filter({ hasText: 'bank' }).waitFor();

  step('reorder and add modules in deck settings');
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  await a.page.locator('.deck-module[data-type="german"]').waitFor();
  await settled();
  await dragWatched(a.page, a.page.locator('.deck-module[data-type="text"] .tab-button'), a.page.locator('.deck-module[data-type="german"]'),
    'Text dragged below German in deck settings', { dragged: 'Text' });
  await settled();
  await openFamily(windowModule(a.page, 'chinese'));
  const configuring = await watchMotion(a.page, { ...CARDS, flashes: NEVER });
  await a.page.locator('.window-module[data-type="chinese"]').getByRole('button', { name: 'Add Chinese at the end', exact: true }).click();
  assertSmooth(await configuring.finish(), { label: 'Chinese added at the end of deck settings', still: ['Context', 'German', 'Text'] });
  step.done();
});
