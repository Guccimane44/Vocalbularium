// Localisation: the account’s language, right to left and the pseudo-languages (D14).
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text, staged } from '../helpers/pages.mjs';
import { BANK, componentArticle, cardTab, launch, accountTrigger, accountMenu, signIn, openFamily } from './helpers.mjs';

// Text an interface shows that is not its own: the brand, the user's decks,
// keys and content, dates, counts, and the languages named in themselves.
const NOT_INTERFACE = '.brand, .meaning, .main-key, .entry, .md, .entry-content, .capture-text, .nav-label, .nav-count, .deck h2, .deck-view h1 bdi, .capture-deck, time, .family-count, .language-name, .language-row-value, .account-name, .account-server, .facet-tab-mark, .facet-tag-mark, .sample-page, .explanation-samples, .facet-explanation .explanation-sample, input, textarea';
// Every visible interface text and label that is not a pseudo-language message.
const unaccented = page => page.evaluate(selector => {
  const found = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    const text = node.textContent.trim();
    if (!element || !/\p{L}{2}/u.test(text) || element.closest(selector) || !element.checkVisibility()) continue;
    if (!/[⟦⟧]/.test(text)) found.push(text);
  }
  for (const element of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
    if (element.closest(selector) && !element.matches('input, textarea') || !element.checkVisibility()) continue;
    for (const name of ['aria-label', 'title', 'placeholder']) {
      const value = element.getAttribute(name);
      if (value && /\p{L}{2}/u.test(value) && !/[⟦⟧]/.test(value)) found.push(`${name}=${value}`);
    }
  }
  return [...new Set(found)];
}, NOT_INTERFACE);

test('0.9.0: Language in the account menu is the account’s preference, English by default, and another installation’s choice follows (D14)', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-language-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const documentLanguage = () => a.page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]);
  // Signed out there is no account, so no Language; the interface is English.
  assert.deepEqual(await documentLanguage(), ['en', 'ltr']);
  assert.equal(await a.page.getByRole('button', { name: /^Language/ }).count(), 0);
  await signIn(a.page);
  // The account menu's Language row shows the current language and opens the list in the menu.
  await accountMenu(a.page);
  const row = a.page.getByRole('button', { name: 'Language, English', exact: true });
  await a.page.locator('.account-panel').screenshot({ path: 'artifacts/v0.9.0-account-menu-light.png' });
  await row.click();
  const list = a.page.getByRole('group', { name: 'Language', exact: true });
  await list.waitFor();
  assert.equal(await row.isVisible(), false, 'the list takes the menu’s place');
  const choices = list.locator('.language-choice');
  assert.deepEqual(await choices.evaluateAll(nodes => nodes.map(node => [node.dataset.language, node.getAttribute('aria-pressed'), node.disabled])), [
    ['en', 'true', false], ['ar', 'false', false], ['zh-Hans', 'false', false], ['fr', 'false', false], ['ru', 'false', false], ['es', 'false', false]
  ], 'every language listed in its own name; each is reviewed, so each can be picked');
  assert.equal(await list.getByRole('button', { name: 'Français', exact: true }).isDisabled(), false);
  assert.equal(await list.locator('[data-language="ar"] .language-name').getAttribute('dir'), 'rtl');
  assert.equal(await a.page.evaluate(() => document.activeElement?.dataset.language), 'en', 'the focus moves to the first language that can be picked');
  for (const theme of ['light', 'dark']) {
    await a.page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await a.page.locator('.account-panel').screenshot({ path: `artifacts/v0.9.0-language-list-${theme}.png` });
  }
  await a.page.evaluate(() => { delete document.documentElement.dataset.theme; });
  // Back returns to the menu with the focus on Language; picking the current language closes the menu.
  await list.getByRole('button', { name: 'Back to the account menu', exact: true }).click();
  assert.equal(await a.page.evaluate(() => document.activeElement?.classList.contains('language-row')), true);
  await row.click();
  await list.locator('[data-language="en"]').click();
  assert.equal(await a.page.locator('.account-panel').isVisible(), false);
  // The worker saves the preference to the account and returns the refreshed account.
  const saved = await a.page.evaluate(() => chrome.runtime.sendMessage({ type: 'set-language', language: 'en' }));
  assert.equal(saved.account.language, 'en');
  assert.equal((await application.store.summary()).language, 'en');
  const rejected = await a.page.evaluate(() => chrome.runtime.sendMessage({ type: 'set-language', language: 'de' }));
  assert.equal(rejected.code, 'invalid');
  // Another installation chooses French: this one follows after its next refresh, without a reload, and keeps it after one.
  await application.store.setLanguage('remote-french', 'fr');
  await a.page.getByRole('heading', { name: 'Vos paquets', exact: true }).waitFor({ timeout: 15000 });
  assert.deepEqual(await documentLanguage(), ['fr', 'ltr']);
  await a.page.locator('.account-trigger').click();
  await a.page.getByRole('button', { name: 'Langue, Français', exact: true }).waitFor();
  await a.page.reload();
  await a.page.getByRole('heading', { name: 'Vos paquets', exact: true }).waitFor();
  assert.deepEqual(await documentLanguage(), ['fr', 'ltr']);
});

test('0.9.0: right to left and the pseudo-languages: every surface mirrors, content keeps its direction, and no interface text escapes the catalogue (D14)', { timeout: 90000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-rtl-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1000 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'rtl', epoch: 1 };
  await store.openSession('rtl-session', session);
  const { pageId } = await store.capture('rtl-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const [german] = (await store.page(pageId)).components.filter(item => item.moduleType === 'german');
  await store.stage(german.attemptId, staged(BANK));
  await store.publish('rtl-publish', { attemptId: german.attemptId, session });
  await signIn(a.page);
  const pseudo = value => a.page.evaluate(language => language ? chrome.storage.local.set({ pseudoLanguage: language }) : chrome.storage.local.remove('pseudoLanguage'), value);
  const box = locator => locator.evaluate(node => { const { left, right, top, bottom } = node.getBoundingClientRect(); return { left, right, top, bottom }; });
  // A card is shot with the row above it, where its tab and question stand.
  const shoot = async (name, locator) => {
    for (const theme of ['light', 'dark']) {
      await a.page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const path = `artifacts/v0.9.0-${name}-${theme}.png`;
      if (!locator) await a.page.screenshot({ path });
      else { const area = await box(locator); await a.page.screenshot({ path, clip: { x: area.left - 40, y: area.top - 40, width: area.right - area.left + 80, height: Math.min(700, area.bottom - area.top + 80) } }); }
    }
    await a.page.evaluate(() => { delete document.documentElement.dataset.theme; });
  };

  // Right to left (ar-XB): the document and every surface mirror.
  await pseudo('ar-XB');
  await a.page.waitForFunction(() => document.documentElement.dir === 'rtl');
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  const sidebar = await box(a.page.locator('#sidebar')), main = await box(a.page.locator('#app'));
  assert.ok(sidebar.left > main.left, 'the sidebar stands at the right');
  await accountMenu(a.page);
  // Measured once the menu has finished opening.
  await a.page.locator('.account-panel').evaluate(node => Promise.all(node.getAnimations().map(each => each.finished)));
  const trigger = await box(accountTrigger(a.page)), panel = await box(a.page.locator('.account-panel'));
  assert.ok(Math.abs(panel.right - trigger.right) < 2 && Math.abs(panel.left - trigger.left) < 2 && panel.bottom <= trigger.top, `the account menu opens upward over the trigger, as wide as it (D23): ${JSON.stringify({ panel, trigger })}`);
  await a.page.keyboard.press('Escape');
  await shoot('rtl-dashboard');

  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  await card.waitFor();
  const cardBox = await box(card), tab = await box(card.locator('.card-tab')), tags = await box(card.locator('.facet-tags'));
  assert.ok(cardBox.right - tab.right < 40 && tab.left - cardBox.left > 100, 'the card’s tab sits at its right');
  assert.ok(tags.left > cardBox.right - 12, 'the facet tags stick out of the card’s right edge');
  assert.equal(await card.locator('.md p, .md ol').first().evaluate(node => getComputedStyle(node).direction), 'ltr', 'German content keeps its own direction');
  assert.equal(await a.page.locator('h1.main-key').evaluate(node => getComputedStyle(node).direction), 'ltr', 'so does a Latin main key');
  const windowBox = await box(a.page.locator('.module-window'));
  assert.ok(windowBox.right < cardBox.left, 'the module window stands at the left of the page');
  await shoot('rtl-page');
  // A card's actions spring out from its tab towards the reading end, and Delete asks beside it.
  await cardTab(a.page, 'German').click();
  const actions = card.locator('.card-actions');
  await actions.getByRole('button', { name: 'Delete German', exact: true }).click();
  await actions.getByText('Are you sure?', { exact: true }).waitFor();
  const question = await box(actions.locator('.confirm-text')), cancel = await box(actions.getByRole('button', { name: 'Keep German', exact: true }));
  assert.ok(question.right <= cancel.left + 1, 'the question stands after Cancel in the reading order, at its left');
  await a.page.waitForTimeout(700);
  await shoot('rtl-card-question', card);
  await actions.getByRole('button', { name: 'Keep German', exact: true }).click();
  await actions.getByRole('button', { name: 'Facets of German', exact: true }).click();
  const window = a.page.getByRole('group', { name: 'Facets of German', exact: true });
  await window.waitFor();
  await a.page.waitForTimeout(300);
  await shoot('rtl-facet-window', card);
  await a.page.keyboard.press('Escape');
  await window.waitFor({ state: 'detached' });
  // Keyboard reordering still moves a module, the arrows following the reading direction.
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${(await store.snapshot()).id}`);
  await a.page.getByRole('heading', { name: 'Modules for new pages', exact: true }).waitFor();
  await shoot('rtl-deck-settings');

  // The accented pseudo-language (en-XA): no visible interface text or label is left in plain English.
  await pseudo('en-XA');
  await a.page.waitForFunction(() => document.documentElement.lang === 'en-XA' && document.documentElement.dir === 'ltr');
  await a.page.goto(`chrome-extension://${a.id}/app.html`);
  await a.page.locator('.recent').waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'dashboard');
  await a.page.locator('.account-trigger').click();
  await a.page.locator('.account-panel').waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'account menu');
  await a.page.locator('.language-row').click();
  assert.deepEqual(await unaccented(a.page), [], 'language list');
  await a.page.keyboard.press('Escape');
  await a.page.locator('.deck .open').first().click();
  await a.page.locator('.page-row').first().waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'deck page list');
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.locator('article.component[data-type="german"]').waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'page');
  await a.page.locator('article.component[data-type="german"] .tab-button').click();
  assert.deepEqual(await unaccented(a.page), [], 'card actions');
  await shoot('pseudo-page');
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${(await store.snapshot()).id}`);
  await a.page.locator('.module-window').waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'deck settings');
  await a.page.goto(`chrome-extension://${a.id}/app.html#diagnostics`);
  await a.page.locator('section h1').waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'diagnostic logs');

  // Without a pseudo-language the interface is the account's English again.
  await pseudo(null);
  await a.page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr');
});

test('0.9.0: the interface in each language: picked from Language, saved to the account, with its names, explanations and direction (D14)', { timeout: 120000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-languages-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1000 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'languages', epoch: 1 };
  await store.openSession('languages-session', session);
  const { pageId } = await store.capture('languages-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const [german] = (await store.page(pageId)).components.filter(item => item.moduleType === 'german');
  await store.stage(german.attemptId, staged(BANK));
  await store.publish('languages-publish', { attemptId: german.attemptId, session });
  const catalogue = async code => JSON.parse(await readFile(`extension/locales/${code}/messages.json`, 'utf8'));
  const english = await catalogue('en');
  await signIn(a.page);

  // Picked from the account menu's Language list, French applies at once, without a reload.
  const french = await catalogue('fr');
  await accountMenu(a.page);
  await a.page.getByRole('button', { name: 'Language, English', exact: true }).click();
  await a.page.locator('.language-choice[data-language="fr"]').click();
  await a.page.getByRole('heading', { name: french['dashboard.title'], exact: true }).waitFor();
  assert.equal((await store.summary()).language, 'fr');
  assert.deepEqual(await a.page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), ['fr', 'ltr']);

  for (const code of ['fr', 'es', 'ru', 'zh-Hans', 'ar']) {
    const messages = await catalogue(code);
    await store.setLanguage(`language-${code}`, code);
    await a.page.goto(`chrome-extension://${a.id}/app.html`);
    await a.page.getByRole('heading', { name: messages['dashboard.title'], exact: true }).waitFor({ timeout: 15000 });
    assert.deepEqual(await a.page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), [code, code === 'ar' ? 'rtl' : 'ltr']);
    await a.page.screenshot({ path: `artifacts/v0.9.0-${code}-dashboard-light.png` });
    // A page: the module's name, its facets' names, in the language; the facet marks as the catalog gives them.
    await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
    const card = a.page.locator('article.component[data-type="german"]');
    await card.waitFor();
    assert.equal(await card.locator('.card-tab .tab-label').innerText(), messages['catalog.german.label']);
    assert.equal(await card.locator('.facet[data-facet="article"] .facet-tab-label').innerText(), messages['catalog.german.article.label']);
    assert.deepEqual(await card.locator('.facet-tag-mark').allInnerTexts(), ['Ar', 'Ex', 'Sy', 'An']);
    assert.equal(await a.page.locator('h1.main-key').evaluate(node => getComputedStyle(node).direction), 'ltr', 'a Latin main key keeps its direction');
    await a.page.screenshot({ path: `artifacts/v0.9.0-${code}-page-light.png` });
    // About German opens its page in the language (D20).
    const about = a.page.locator('.window-module[data-type="german"] .window-about');
    await openFamily(about);
    await about.click();
    const summary = JSON.parse(await readFile(`packages/domain/src/catalog/languages/german/about.${code}.json`, 'utf8')).summary;
    const dialog = a.page.locator('dialog.about-sheet');
    await dialog.waitFor();
    assert.equal(await dialog.locator('.about-lede').innerText(), summary, `${code}: the page is in the language`);
    await dialog.screenshot({ path: `artifacts/v0.9.0-${code}-about-light.png` });
    await a.page.keyboard.press('Escape');
    assert.notEqual(messages['dashboard.title'], english['dashboard.title']);
  }

  // Arabic in both themes, with forced colours off and on: the page and the Language list stay
  // outlined and readable, right to left (0.9.0 increment D).
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.locator('article.component[data-type="german"]').waitFor();
  await a.page.locator('.account-trigger').click();
  await a.page.locator('.language-row').click();
  const panel = a.page.locator('.account-panel');
  for (const colorScheme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
    await a.page.emulateMedia({ colorScheme, forcedColors });
    const name = `${colorScheme}${forcedColors === 'active' ? '-forced' : ''}`;
    const edge = await panel.evaluate(node => { const style = getComputedStyle(node); return { border: style.borderTopStyle, shadow: style.boxShadow }; });
    assert.ok(forcedColors === 'active' ? edge.border === 'solid' : edge.shadow !== 'none', `${name}: the account menu is outlined (${JSON.stringify(edge)})`);
    assert.equal(await a.page.evaluate(() => document.documentElement.dir), 'rtl');
    await a.page.screenshot({ path: `artifacts/v0.9.0-ar-language-${name}.png`, animations: 'disabled' });
  }
  await a.page.emulateMedia({ colorScheme: 'light', forcedColors: 'none' });
  await a.page.keyboard.press('Escape');

  // Back to English from the list, which names every language in itself, all of them offered.
  await a.page.goto(`chrome-extension://${a.id}/app.html`);
  await a.page.locator('.account-trigger').click();
  await a.page.locator('.language-row').click();
  assert.deepEqual(await a.page.locator('.language-choice').evaluateAll(nodes => nodes.map(node => [node.dataset.language, node.disabled])),
    [['en', false], ['ar', false], ['zh-Hans', false], ['fr', false], ['ru', false], ['es', false]]);
  await a.page.locator('.language-choice[data-language="en"]').click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.equal((await store.summary()).language, 'en');
});
