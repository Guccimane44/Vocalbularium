// Deck settings: modules, the module limit, deck menus and default-deck deletion.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { text, staged } from '../helpers/pages.mjs';
import { modulesOf, componentArticle, removeFromDeck, launch, signIn, waitFor, addFromWindow, drag } from './helpers.mjs';

test('deck UI: draft previews, all modules, the module limit, removal without content loss, and default deletion', { timeout: 40000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-decks-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  await a.page.getByRole('button', { name: 'New deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).fill('Discard this draft');
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await application.store.account()).decks.length, 1);

  await a.page.getByRole('button', { name: 'New deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).fill('Everyday Chinese');
  // A new deck has a colour, one of the six, which the user can change (D06).
  assert.equal(await a.page.getByRole('group', { name: 'Deck colour' }).getByRole('radio').count(), 6);
  assert.equal(await a.page.getByRole('group', { name: 'Deck colour' }).getByRole('radio', { checked: true }).count(), 1);
  await a.page.getByRole('radio', { name: 'Rose', exact: true }).check();
  assert.equal(await a.page.locator('.deck-module').count(), 3, 'a new deck starts with the main key, Context and the German');
  // The main key is a tab like the other modules, with no lock mark (0.6.3), drag label, menu or Remove.
  const mainKeyBlock = a.page.locator('.deck-module[data-type="main-key"]');
  assert.equal(await mainKeyBlock.innerText(), 'Main key');
  assert.equal(await mainKeyBlock.getByRole('img').count(), 0, 'no lock mark');
  assert.equal(await mainKeyBlock.locator('.tab-button, button').count(), 0, 'no drag label, menu or Remove on the main key');
  await addFromWindow(a.page, 'chinese');
  const usage = a.page.locator('.sortable-row:not(.landing-row):not([data-dragging])').filter({ has: a.page.locator('.deck-module[data-type="chinese"]') });
  await usage.waitFor();
  // Dropped on the upper half of Chinese, German lands before it.
  await addFromWindow(a.page, 'german', usage, { above: true });
  await addFromWindow(a.page, 'chinese');
  await addFromWindow(a.page, 'chinese');
  assert.equal(await a.page.locator('.deck-module').count(), 7);
  assert.equal(await a.page.locator('.module-window .window-module').count(), 12, 'the window offers Context, Text, the three Languages parents (D08; one English since D34), the three Expertise modules (D11, D30), Pronunciation (D24) and the three Creativity modules (D30)');
  // Every module has its + (0.6.3; D04 had none); facets are not in the window (D13, 0.8.1).
  assert.equal(await a.page.locator('.window-module > .window-add').count(), 12, 'every module has its +');
  assert.equal(await a.page.locator('.window-facet').count(), 0, 'and no facet is listed');
  assert.equal(await a.page.locator('.window-module[data-type="context"]').getAttribute('aria-disabled'), 'true', 'one Context per deck');
  assert.equal(await a.page.locator('.window-module[data-type="context"] .window-add').isDisabled(), true, 'a blocked module cannot be added');
  await a.page.getByText('Only one Context module per page.').waitFor();
  // Deck settings have no Preview (0.13.2; a dialog from 0.6.3, beside the list before).
  assert.equal(await a.page.getByRole('button', { name: 'Preview', exact: true }).count(), 0, 'no Preview button');
  assert.equal(await a.page.locator('.sample-page, .preview-dialog').count(), 0, 'and no preview');
  await a.page.screenshot({ path: 'artifacts/m3-configuration-list.png' });
  const listTypes = () => a.page.locator('.shaping-list .deck-module').evaluateAll(nodes => nodes.slice(1).map(node => node.dataset.type));
  // A module's tab is two parts edge to edge, as on a page: the six dots at its left end, then its icon and name.
  const block = a.page.locator('.deck-module[data-type="chinese"]').first();
  await block.scrollIntoViewIfNeeded();
  assert.deepEqual(await block.locator('.card-tab').evaluate(node => {
    const box = node.getBoundingClientRect();
    return [5, box.width / 2].map(x => document.elementFromPoint(box.left + x, box.top + box.height / 2)?.closest('.menu-button, .tab-button')?.className);
  }), ['menu-button', 'tab-button']);
  // A module drags by its label (D07).
  await block.locator('.tab-button').focus();
  await a.page.keyboard.press('Space');
  await new Promise(resolve => setTimeout(resolve, 300));
  await a.page.keyboard.press('ArrowUp');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await a.page.locator('.deck-module').nth(2).getAttribute('data-type'), 'german', 'nothing dropped yet');
  // The others slide to make room.
  const slides = await a.page.locator('.shaping-list .sortable-row').evaluateAll(rows => rows.filter(row => !row.hasAttribute('data-dragging'))
    .map(row => getComputedStyle(row).transitionDuration));
  assert.ok(slides.length && slides.every(duration => parseFloat(duration) >= 0.2), `rows make room with a transition (${slides})`);
  await a.page.keyboard.press('Escape');
  assert.deepEqual(await listTypes(), ['context', 'german', 'german', 'chinese', 'chinese', 'chinese'], 'a cancelled drag keeps the order');
  assert.equal((await application.store.pages()).length, 0); assert.equal((await application.store.account()).decks.length, 1);
  await a.page.screenshot({ path: 'artifacts/m3-configuration.png', fullPage: true });
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor();
  const created = (await application.store.account()).decks.find(deck => deck.name === 'Everyday Chinese');
  assert.deepEqual(created.modules.map(module => module.type),
    ['main-key', 'context', 'german', 'german', 'chinese', 'chinese', 'chinese']);
  assert.equal(created.colour, 'sound');
  await a.page.locator('.nav-item.fam-sound').filter({ hasText: 'Everyday Chinese' }).waitFor();
  await a.page.locator('.deck-slot.fam-sound article.deck').filter({ hasText: 'Everyday Chinese' }).waitFor();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Set as default', exact: true }).click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByText('Default', { exact: true }).waitFor();
  assert.equal((await application.store.snapshot()).id, created.id);

  const session = { installationId: 'fixture', sessionId: 'fixture-browser', epoch: 1 };
  await application.store.openSession('fixture-session', session);
  const pageId = (await application.store.capture('fixture-capture', { session, mainKey: '幸福', snapshot: (await application.store.snapshot()) })).pageId;
  for (const item of modulesOf(await application.store.page(pageId))) {
    await application.store.stage(item.attemptId, staged(item.moduleType === 'german' ? 'Saved explanation' : ''));
    await application.store.publish(`fixture-${item.id}`, { attemptId: item.attemptId, session });
  }
  const before = (await application.store.page(pageId)).components.map(item => [item.moduleType, text(item)]);
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Configure deck', exact: true }).click();
  // Two Germans in deck settings are numbered in their tabs (0.7.2).
  await componentArticle(a.page, 'German 2').waitFor();
  assert.deepEqual(await a.page.locator('.deck-module[data-type="german"] .tab-label').allTextContents(), ['German 1', 'German 2']);
  await removeFromDeck(a.page, 'German 1');
  for (let count = 6; count < 12; count++) await addFromWindow(a.page, 'chinese');
  assert.equal(await a.page.locator('.deck-module').count(), 12);
  assert.equal(await a.page.locator('.window-module[aria-disabled="false"]').count(), 0, 'the window is closed at twelve modules');
  await a.page.getByText('At most 12 modules, including the main key.').first().waitFor();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  // Deck settings carry the deck's name as their title (0.16.2): wait for Home itself.
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor();
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'changing the deck needs no content-loss confirmation');
  assert.deepEqual((await application.store.page(pageId)).components.map(item => [item.moduleType, text(item)]), before, 'deck changes never reach an existing page');
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await componentArticle(a.page, 'German 1').getByText('Saved explanation').waitFor();
  await a.page.goto(`chrome-extension://${a.id}/app.html`);
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor({ state: 'detached' });
  assert.equal((await application.store.snapshot()).id, (await application.store.account()).decks.find(deck => deck.name === 'My Deck').id);
  assert.equal((await application.store.pages()).length, 0);
});

test('deck menus: page-list actions, Escape, cancellation, replacement and sole-deck reset', { timeout: 40000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-menu-browser-'));
  const databaseKey = join(directory, 'account-fixture');
  let application = await createTestApplication(t, { databaseKey }); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  assert.equal(await a.page.getByText('YOUR VOCABULARY', { exact: true }).count(), 0);
  assert.equal(await a.page.getByText('YOUR WORDS, KEPT CLOSE.', { exact: true }).count(), 0);
  const second = await application.store.createDeck('Second deck');
  await a.page.reload();
  await a.page.getByRole('heading', { name: 'Second deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).waitFor();
  // A deck's page holds its actions as symbols, named, with no ⋯ menu (0.16.2).
  const head = a.page.getByRole('group', { name: 'Options for Second deck', exact: true });
  assert.deepEqual(await head.getByRole('button').evaluateAll(buttons => buttons.map(button => [button.getAttribute('aria-label'), button.title])),
    [['Set as default', 'Set as default'], ['Configure deck', 'Configure deck'], ['Delete deck', 'Delete deck'], ['Add page manually', 'Add page manually']]);
  assert.equal(await a.page.locator('details.deck-menu').count(), 0, 'no ⋯ menu');
  await head.getByRole('button', { name: 'Configure deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).waitFor();
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Second deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).waitFor();
  await application.close();
  await head.getByRole('button', { name: 'Set as default', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  application = (await createTestApplication(t, { databaseKey })); await application.start();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await waitFor(async () => (await application.store.account()).defaultDeckId === second.id, 'page-list default saved');
  // The default deck's star is filled and is no longer a button.
  await waitFor(async () => await head.locator('.deck-star.is-default').count() === 1, 'the default deck’s filled star');
  assert.equal(await head.getByRole('button', { name: 'Set as default', exact: true }).count(), 0);
  const trash = head.getByRole('button', { name: 'Delete deck', exact: true });
  await trash.click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.match(a.page.url(), /#deck\//);
  await waitFor(() => trash.evaluate(node => node === document.activeElement), 'the focus back on the trash');
  await trash.click();
  assert.equal(await a.page.getByRole('dialog').getByLabel('New default deck').inputValue(), (await application.store.account()).decks.find(deck => deck.id !== second.id).id);
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.equal((await application.store.account()).decks.length, 1);
  await a.page.getByRole('heading', { name: 'My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).waitFor();
  const original = (await application.store.snapshot()).id;
  await a.page.getByRole('group', { name: 'Options for My Deck', exact: true }).getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('dialog').getByText(/A new empty My Deck will replace it/).waitFor();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.notEqual((await application.store.snapshot()).id, original);
  assert.equal((await application.store.account()).decks.length, 1);
});

test('default-deck deletion can choose a replacement beyond the first deck page', { timeout: 35000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-deck-pages-'));
  const application = await createTestApplication(t); await application.start();
  let last;
  for (let index = 0; index < 45; index++) last = await application.store.createDeck(`Deck ${index}`);
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  await a.page.getByRole('group', { name: 'Options for My Deck', exact: true }).getByRole('button', { name: 'Delete deck', exact: true }).click();
  const modal = a.page.getByRole('dialog');
  assert.equal(await modal.getByLabel('New default deck').locator('option').count(), 39);
  await modal.getByRole('button', { name: 'Load more decks' }).click();
  await modal.getByLabel('New default deck').selectOption({ label: 'Deck 44' });
  await modal.getByRole('button', { name: 'Delete deck', exact: true }).click();
  await waitFor(async () => (await application.store.account()).defaultDeckId === last.id, 'later-page replacement saved');
});
