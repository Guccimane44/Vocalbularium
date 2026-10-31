// Parents and facets: the facet window, by pointer and keyboard.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { text, staged } from '../helpers/pages.mjs';
import { BANK, componentArticle, cardTab, cardButton, facetWindow, tick, inOrder, launch, signIn, waitFor, windowModule, openFamily } from './helpers.mjs';

const ticked = (window, facet) => tick(window, facet).evaluate(button => button.closest('.facet-window-row').hasAttribute('data-equipped'));

test('parents and facets: core only on add, the facet window on the parent, its question, waiting and deleted facets, and deck settings', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facets-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facets', epoch: 1 };
  await store.openSession('facets-session', session);
  // A new account's My Deck holds German with all its facets (D08).
  const { pageId } = await store.capture('facets-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = () => store.page(pageId).then(page => page.components.filter(item => item.moduleType === 'german'));
  const [first] = await german();
  assert.deepEqual(first.facets, ['article', 'examples', 'synonyms', 'antonyms']);
  await store.stage(first.attemptId, staged(BANK));
  await store.publish('facets-publish', { attemptId: first.attemptId, session });
  const card = name => componentArticle(a.page, name);
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await card('German').locator('.facet').first().waitFor();

  // The core, then each facet under its label. How the key was read is in the
  // card's top line, in the module's language, and nothing under the title (D17).
  assert.deepEqual(await card('German').locator('.entry-heading .entry-label').allTextContents(), ['Wort', 'Nomen']);
  assert.equal(await card('German').locator('.entry-heading .entry-language').textContent(), 'Englisch');
  assert.equal(await a.page.locator('.page-title .interpretation').count(), 0, 'no reading under the main key');
  assert.deepEqual(await card('German').locator('.facet .facet-tab-label').allTextContents(), ['Article', 'Examples', 'Synonyms', 'Antonyms']);
  assert.equal(await card('German').locator('.entry-core li').textContent(), 'Ufer');

  // The module window lists modules only: no facets beneath a parent (D13, 0.8.1).
  await openFamily(windowModule(a.page, 'german'));
  assert.equal(await a.page.locator('.module-window .window-facets, .module-window .window-facet').count(), 0, 'no facets in the window');

  // A German parent's facet window lists its four facets in the module's order, the ones it has ticked.
  let facets = await facetWindow(a.page, 'German');
  assert.deepEqual(await inOrder(facets, 'name'), ['Article', 'Examples', 'Synonyms', 'Antonyms', 'Conjugation', 'Declension', 'Comparison', 'Case', 'Pronunciation'],
    'every facet of German, the grammar facets (D17) and Pronunciation (D24) included');
  assert.deepEqual(await inOrder(facets, 'equipped'), [true, true, true, true, false, false, false, false, false], 'the grammar facets and Pronunciation are not on a My Deck card (K56)');
  await waitFor(() => tick(facets, 'Article').evaluate(node => node === document.activeElement), 'the first row takes the focus');
  // A card on the surface (D23, 0.13.3): a heading naming the parent, a close, and a line on Retry.
  assert.equal(await facets.getByRole('heading', { level: 3 }).textContent(), 'Facets of German');
  assert.equal(await facets.locator('.facet-window-hint').textContent(), 'Added facets fill in on the next Retry.');
  // Two groups: the facets on the card, each with its Remove, then the others, each with its Add.
  assert.deepEqual(await facets.locator('.facet-window-group').allTextContents(), ['On this card', 'Add']);
  assert.deepEqual(await facets.getByRole('list', { name: 'On this card', exact: true }).locator('.facet-toggle').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))),
    ['Remove Article', 'Remove Examples', 'Remove Synonyms', 'Remove Antonyms']);
  assert.equal(await facets.getByRole('list', { name: 'Add', exact: true }).getByRole('button', { name: 'Add Conjugation', exact: true }).count(), 1);

  // Unticking a facet with content asks in its row; Cancel keeps it.
  await tick(facets, 'Examples').click();
  const keep = facets.getByRole('button', { name: 'Keep Examples from German', exact: true });
  await waitFor(() => keep.evaluate(node => node === document.activeElement), 'Cancel takes the focus');
  await keep.click();
  await waitFor(() => tick(facets, 'Examples').evaluate(node => node === document.activeElement), 'the focus back on its tick');
  assert.equal(await ticked(facets, 'Examples'), true);
  assert.equal((await german())[0].facets.includes('examples'), true, 'Cancel keeps the facet');
  // Confirmed, it goes, leaving the rest of the content and the module; the window stays open for more.
  await tick(facets, 'Examples').click();
  await facets.getByRole('button', { name: 'Yes, delete Examples from German', exact: true }).click();
  await waitFor(async () => !(await german())[0].facets.includes('examples'), 'Examples deleted');
  await card('German').locator('.facet[data-facet="examples"]').waitFor({ state: 'detached' });
  assert.doesNotMatch(text((await german())[0]), /Examples/);
  assert.equal(await facets.isVisible(), true, 'the window stays open');
  assert.equal(await ticked(facets, 'Examples'), false);
  // Escape closes it and returns the focus to the card's tab.
  await a.page.keyboard.press('Escape');
  await facets.waitFor({ state: 'detached' });
  assert.equal(await cardTab(a.page, 'German').evaluate(node => node === document.activeElement), true, 'the focus back on the tab');
  // Its close does the same (D23).
  facets = await facetWindow(a.page, 'German');
  await facets.getByRole('button', { name: 'Close', exact: true }).click();
  await facets.waitFor({ state: 'detached' });
  assert.equal(await cardTab(a.page, 'German').evaluate(node => node === document.activeElement), true, 'the close returns the focus to the tab');

  // A parent added from the window has its core only; its facet window lists its own facets.
  await openFamily(windowModule(a.page, 'chinese'));
  await a.page.getByRole('button', { name: 'Add Chinese at the end', exact: true }).click();
  await card('Chinese').waitFor();
  const chinese = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'chinese');
  await waitFor(async () => Boolean(await chinese()), 'Chinese added');
  assert.deepEqual((await chinese()).facets, []);
  facets = await facetWindow(a.page, 'Chinese');
  assert.deepEqual(await inOrder(facets, 'name'), ['Examples', 'Pinyin', 'Pronunciation'], 'never a German facet');
  assert.deepEqual(await inOrder(facets, 'equipped'), [false, false, false]);
  await tick(facets, 'Pinyin').click();
  await waitFor(async () => (await chinese()).facets.includes('pinyin'), 'Pinyin added to Chinese');
  assert.equal((await german())[0].facets.includes('pinyin'), false);
  // A click outside closes the window.
  await a.page.locator('.page-header').click();
  await facets.waitFor({ state: 'detached' });

  // Ticked again on German, Examples joins in the parent's order and waits for Retry.
  facets = await facetWindow(a.page, 'German');
  await tick(facets, 'Examples').click();
  await waitFor(async () => (await german())[0].facets.includes('examples'), 'Examples added back');
  assert.deepEqual((await german())[0].facets, ['article', 'examples', 'synonyms', 'antonyms'], 'in the parent’s order');
  await a.page.keyboard.press('Escape');
  // A re-added facet waits in its slot: its heading only, dimmed, with no text (D10, amended a sixth time).
  await waitFor(async () => await card('German').locator('.facet-tag[data-facet="examples"][data-unfilled]').count() === 1, 'its bland tag');
  assert.notEqual(await card('German').locator('.facet[data-facet="examples"]').getAttribute('data-unfilled'), null, 'its heading, dimmed');
  assert.equal(await card('German').locator('.facet[data-facet="examples"] .facet-body').count(), 0, 'and no text');
  assert.deepEqual(await card('German').locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)),
    ['article', 'examples', 'synonyms', 'antonyms']);
  assert.deepEqual(await card('German').locator('.facet-tag .facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  await a.page.screenshot({ path: 'artifacts/v0.7.0-facets-page.png', fullPage: true });

  // Two German parents each choose their own facets: ticked on German 2, Synonyms goes there alone
  // and its tag flies in from its row (D13).
  await card('German').locator('.facet[data-facet="synonyms"]').hover();
  await a.page.getByRole('button', { name: 'Delete Synonyms from German', exact: true }).click();
  await a.page.getByRole('button', { name: 'Yes, delete Synonyms from German', exact: true }).click();
  await waitFor(async () => !(await german())[0].facets.includes('synonyms'), 'Synonyms deleted');
  await a.page.getByRole('button', { name: 'Add German at the end', exact: true }).click();
  await waitFor(async () => (await german()).length === 2, 'second German added');
  // Two Germans on one page are numbered in their tabs, in the page's order (0.7.2).
  await card('German 2').waitFor();
  assert.deepEqual(await a.page.locator('.component[data-type="german"] .tab-label').allTextContents(), ['German 1', 'German 2']);
  await a.page.evaluate(() => {
    window.tagMotions = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.classList?.contains('facet-tag')) window.tagMotions.push({ facet: this.dataset.facet, keyframes: keyframes.map(frame => frame.transform ?? null) });
      return original.call(this, keyframes, options);
    };
  });
  facets = await facetWindow(a.page, 'German 2');
  assert.deepEqual(await inOrder(facets, 'equipped'), Array(9).fill(false), 'a core only');
  await a.page.screenshot({ path: 'artifacts/v0.8.1-facet-window.png', fullPage: true, animations: 'disabled' });
  await tick(facets, 'Synonyms').click();
  await waitFor(async () => (await german())[1].facets.includes('synonyms'), 'Synonyms added to the second German');
  assert.equal((await german())[0].facets.includes('synonyms'), false, 'and not to the first');
  await waitFor(async () => (await card('German 2').locator('.facet-tag .facet-tag-mark').allTextContents()).join() === 'Sy', 'its tag');
  const flight = (await a.page.evaluate(() => window.tagMotions)).filter(each => each.facet === 'synonyms' && each.keyframes.length === 3).at(-1);
  assert.ok(flight, 'the tag flies in from its row');
  await a.page.keyboard.press('Escape');

  // Deck settings: a parent, folded, hangs its facets' tags from its bottom edge; they can be removed, and new pages copy them.
  const deckId = (await store.page(pageId)).deckId;
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  const row = a.page.locator('.deck-module[data-type="german"]');
  await row.locator('.facet-tag').first().waitFor();
  assert.equal(await row.locator('.facet-tags').getAttribute('data-layout'), 'folded');
  assert.deepEqual(await row.locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  await tick(await facetWindow(a.page, 'German'), 'Antonyms').click();
  await a.page.keyboard.press('Escape');
  await waitFor(async () => await row.locator('.facet-tag:not([data-leaving])').count() === 3, 'the Antonyms tag popped');
  // In deck settings the same window changes the draft; with no content to lose, unticking never asks.
  await a.page.getByRole('button', { name: 'Add German at the end', exact: true }).click();
  const deckGermans = a.page.locator('.deck-module[data-type="german"]');
  await deckGermans.nth(1).waitFor();
  facets = await facetWindow(a.page, 'German 2');
  await tick(facets, 'Antonyms').click();
  await waitFor(async () => (await deckGermans.nth(1).locator('.facet-tag-mark').allTextContents()).join() === 'An', 'Antonyms on German 2');
  assert.deepEqual(await deckGermans.nth(0).locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy']);
  await tick(facets, 'Antonyms').click();
  await waitFor(async () => await deckGermans.nth(1).locator('.facet-tag:not([data-leaving])').count() === 0, 'unticked at once');
  assert.equal(await facets.getByRole('button', { name: /^Yes, delete/ }).count(), 0, 'without a question');
  await tick(facets, 'Antonyms').click();
  await waitFor(async () => (await deckGermans.nth(1).locator('.facet-tag:not([data-leaving]) .facet-tag-mark').allTextContents()).join() === 'An', 'ticked again');
  await a.page.keyboard.press('Escape');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(async () => (await store.deck(deckId)).modules.filter(module => module.type === 'german').length === 2, 'deck saved');
  assert.deepEqual((await store.deck(deckId)).modules.filter(module => module.type === 'german').map(module => module.facets),
    [['article', 'examples', 'synonyms'], ['antonyms']]);
});

test('facet window from the keyboard: Facet among the actions, Space on a tick, the question and Escape, and back to the tab', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-keys-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facet-keys', epoch: 1 };
  await store.openSession('facet-keys-session', session);
  const { pageId } = await store.capture('facet-keys-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = () => store.page(pageId).then(page => page.components.find(item => item.moduleType === 'german'));
  const first = await german();
  await store.stage(first.attemptId, staged(BANK));
  await store.publish('facet-keys-publish', { attemptId: first.attemptId, session });
  const card = name => componentArticle(a.page, name);
  const focused = locator => locator.evaluate(node => node === document.activeElement);
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await card('German').locator('.facet').first().waitFor();

  // Enter on the tab ejects the actions; Facet stands after Retry (D13, 0.8.1), About before Fold (D20).
  await cardTab(a.page, 'German').focus();
  await a.page.keyboard.press('Enter');
  const actions = card('German').locator('.card-actions button');
  await actions.first().waitFor();
  assert.deepEqual(await actions.allTextContents(), ['Edit', 'Retry', 'Facet', 'About', 'Fold', 'Delete']);
  await a.page.getByRole('button', { name: 'Facets of German', exact: true }).focus();
  await a.page.keyboard.press('Enter');
  const facets = a.page.getByRole('group', { name: 'Facets of German', exact: true });
  await facets.waitFor();
  await waitFor(() => focused(tick(facets, 'Article')), 'the focus on the first tick');

  // Tab moves through each row's ›, then its tick; Space on a tick with content asks, with the focus on
  // Cancel; Escape takes back the question and returns the focus to its tick, still ticked.
  await a.page.keyboard.press('Tab');
  assert.equal(await focused(facets.getByRole('button', { name: 'About Examples', exact: true })), true);
  await a.page.keyboard.press('Tab');
  await a.page.keyboard.press('Tab');
  await a.page.keyboard.press('Tab');
  assert.equal(await focused(tick(facets, 'Synonyms')), true);
  await a.page.keyboard.press('Space');
  await waitFor(() => focused(facets.getByRole('button', { name: 'Keep Synonyms from German', exact: true })), 'Cancel focused');
  await a.page.keyboard.press('Escape');
  await waitFor(() => focused(tick(facets, 'Synonyms')), 'the focus back on its tick');
  assert.equal(await ticked(facets, 'Synonyms'), true);
  assert.equal(await facets.isVisible(), true, 'the first Escape answers the question only');
  // Asked again, Shift+Tab reaches the final Delete, and Enter removes the facet.
  await a.page.keyboard.press('Space');
  await waitFor(() => focused(facets.getByRole('button', { name: 'Keep Synonyms from German', exact: true })), 'Cancel focused');
  await a.page.keyboard.press('Shift+Tab');
  assert.equal(await focused(facets.getByRole('button', { name: 'Yes, delete Synonyms from German', exact: true })), true);
  await a.page.keyboard.press('Enter');
  await waitFor(async () => !(await german()).facets.includes('synonyms'), 'Synonyms removed');
  await waitFor(() => focused(tick(facets, 'Synonyms')), 'the focus back on its tick');
  // Once the removal is saved, Space ticks it again; it waits for Retry. While it saves, the ticks are unavailable.
  await waitFor(async () => await tick(facets, 'Synonyms').getAttribute('aria-disabled') === null, 'the ticks available again');
  await a.page.keyboard.press('Space');
  await waitFor(async () => (await german()).facets.includes('synonyms'), 'Synonyms added again');
  await waitFor(async () => await card('German').locator('.facet-tag[data-facet="synonyms"][data-unfilled]').count() === 1, 'waiting for Retry');
  // Escape closes the window and returns the focus to the tab.
  await a.page.keyboard.press('Escape');
  await facets.waitFor({ state: 'detached' });
  assert.equal(await focused(cardTab(a.page, 'German')), true);

  // While the card is edited its actions stay in, so the window cannot open.
  await (await cardButton(a.page, 'Edit German')).click();
  await card('German').locator('.component-tools').waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Facets of German', exact: true }).count(), 0);
  await card('German').getByRole('button', { name: 'Cancel', exact: true }).click();
});
