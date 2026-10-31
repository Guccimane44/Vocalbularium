// Family, module and facet pages (D20).
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PARENTS } from '@vocabularium/domain/parents';
import { text, staged } from '../helpers/pages.mjs';
import { BANK, componentArticle, cardTab, facetWindow, inOrder, launch, signIn, waitFor, steps, openFamily } from './helpers.mjs';

// A sample the catalog stores for the pages (D20).
const catalogSample = async (folder, language = 'en') => JSON.parse(await readFile(`packages/domain/src/catalog/${folder}/samples/${language}.json`, 'utf8'));

test('0.13.0: family, module and facet pages in one sheet, from the module window, a card, the facet window and deck settings (D20)', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-explanations-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'explanations', epoch: 1 };
  await store.openSession('explanations-session', session);
  const { pageId } = await store.capture('explanations-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const [german] = (await store.page(pageId)).components.filter(item => item.moduleType === 'german');
  await store.stage(german.attemptId, staged(BANK));
  await store.publish('explanations-publish', { attemptId: german.attemptId, session });
  const components = async () => (await store.page(pageId)).components.length;
  const before = await components();
  const focused = locator => locator.evaluate(node => node === document.activeElement);
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await componentArticle(a.page, 'German').waitFor();

  // About German, below its description, opens its module page in the sheet over the module window (D20, 0.13.0).
  const sheet = a.page.locator('dialog.about-sheet');
  const title = () => sheet.locator('h2').innerText();
  const path = () => sheet.locator('.about-path').innerText();
  const about = a.page.locator('.window-module[data-type="german"] .window-about');
  await openFamily(about);
  assert.equal(await about.innerText(), 'About German');
  await about.click();
  await sheet.waitFor();
  assert.equal(await title(), 'German');
  assert.match(await path(), /^Languages\s*\/\s*German$/);
  assert.match(await sheet.locator('.about-lede').innerText(), /Explains your key in German/);
  assert.equal(await sheet.locator('.about-facts > div').count(), 3);
  // How it looks: the key above a card with its core only, then the hint that facets follow.
  assert.equal(await sheet.locator('.about-key').innerText(), 'language');
  assert.equal(await sheet.locator('.about-card .facet').count(), 0, 'the core only');
  await sheet.locator('.about-card .about-facet-hint').waitFor();
  // How it works: four lines from the key to the facets.
  assert.deepEqual(await sheet.locator('.about-chain-label').allTextContents(), ['Main key', 'Read as', 'Module core', 'Facets']);
  const english = await catalogSample('languages/german');
  assert.deepEqual(await sheet.locator('.about-chain .about-mk:not([data-out])').allTextContents(),
    Object.keys(PARENTS.german.facets).filter(facet => facet in english.word_phrase.facets).map(facet => PARENTS.german.facets[facet].abbreviation));
  await a.page.screenshot({ path: 'artifacts/v0.13.0-module-page.png', animations: 'disabled' });
  // The key's language and a sentence change the sample; only Examples applies to a sentence.
  // Each language named in itself only (D21).
  assert.deepEqual(await sheet.locator('select option').allTextContents(), ['العربية', 'English', 'Español', 'Français', 'Русский', '中文（简体）']);
  await sheet.getByLabel('Language of the sample key', { exact: true }).selectOption('ru');
  assert.equal(await sheet.locator('.about-key').innerText(), 'язык');
  await sheet.getByRole('button', { name: 'Sentence', exact: true }).click();
  assert.equal(await sheet.locator('.about-key').innerText(), (await catalogSample('main-key', 'ru')).sentence);
  assert.ok((await sheet.locator('.about-card').innerText()).includes((await catalogSample('languages/german', 'ru')).sentence.core.meanings[0]));
  assert.deepEqual(await sheet.locator('.about-chain .about-mk:not([data-out])').allTextContents(), ['Ex', 'Pr'], 'a sentence keeps Examples and Pronunciation (D24)');

  // Article among its facets opens its facet page; Conjugation from the strip has its own word.
  await sheet.locator('.about-row').filter({ has: a.page.locator('.about-row-name', { hasText: /^Article$/ }) }).click();
  await waitFor(async () => await title() === 'Article', 'Article’s page');
  assert.match(await path(), /^Languages\s*\/\s*German\s*\/\s*Article$/);
  assert.equal(await sheet.locator('.about-applies').innerText(), 'Nouns');
  const { singular, plural } = english.word_phrase.facets.article;
  // The sample sits on its card: the core and the other facets dimmed, Article in full (0.13.1).
  assert.equal(await sheet.locator('.about-where .about-here .facet-body').innerText(), [singular, plural].filter(Boolean).join(' · '));
  assert.equal(await sheet.locator('.about-where .about-other').count(), Object.keys(english.word_phrase.facets).length - 1);
  assert.equal(await sheet.getByRole('heading', { name: 'Where it sits' }).count(), 0);
  await a.page.screenshot({ path: 'artifacts/v0.13.0-facet-page.png', animations: 'disabled' });
  await sheet.getByRole('button', { name: 'Sentence', exact: true }).click();
  assert.match(await sheet.locator('.about-left-out').innerText(), /Left out/);
  await sheet.locator('.about-strip button', { hasText: 'Conjugation' }).click();
  await waitFor(async () => await title() === 'Conjugation', 'Conjugation’s page');
  assert.equal(await sheet.locator('.about-key').innerText(), 'speak');
  // Its card is its own word's: the core is sprechen, not German's Sprache.
  assert.match(await sheet.locator('.about-where .about-here').innerText(), /habe gesprochen/);
  assert.match(await sheet.locator('.about-where .about-dim').first().innerText(), /sprechen/);
  assert.doesNotMatch(await sheet.locator('.about-where .about-dim').first().innerText(), /Sprache/);
  assert.equal(await sheet.locator('.about-flow').count(), 0, 'no key-to-core flow above the card');
  await a.page.screenshot({ path: 'artifacts/v0.13.1-conjugation-page.png', animations: 'disabled' });
  // Declension has a noun and an adjective (language, good); Synonyms shows good, gut (D21).
  await sheet.locator('.about-strip button', { hasText: 'Declension' }).click();
  await waitFor(async () => await title() === 'Declension', 'Declension’s page');
  assert.deepEqual(await sheet.locator('.about-toggle button').allTextContents(), ['Noun', 'Adjective', 'Sentence']);
  assert.equal(await sheet.locator('.about-key').innerText(), 'language');
  await sheet.getByRole('button', { name: 'Adjective', exact: true }).click();
  assert.equal(await sheet.locator('.about-key').innerText(), 'good');
  assert.match(await sheet.locator('.about-where .about-here').innerText(), /ein guter/);
  await a.page.screenshot({ path: 'artifacts/v0.13.1-declension-page.png', animations: 'disabled' });
  await sheet.locator('.about-strip button', { hasText: 'Synonyms' }).click();
  await waitFor(async () => await title() === 'Synonyms', 'Synonyms’ page');
  assert.deepEqual(await sheet.locator('.about-toggle button').allTextContents(), ['Word', 'Sentence']);
  assert.equal(await sheet.locator('.about-key').innerText(), 'good');
  assert.match(await sheet.locator('.about-where .about-dim').first().innerText(), /gut/);
  assert.ok((await sheet.locator('.about-where .about-here .facet-body').innerText()).trim());
  // Back returns one step; the path's German and Languages open theirs.
  await sheet.getByRole('button', { name: 'Back', exact: true }).click();
  await waitFor(async () => await title() === 'Declension', 'back to Declension');
  await sheet.locator('.about-path button', { hasText: 'German' }).click();
  await waitFor(async () => await title() === 'German', 'German from the path');
  await sheet.locator('.about-path button', { hasText: 'Languages' }).click();
  await waitFor(async () => await title() === 'Languages', 'the family page');
  assert.deepEqual(await sheet.locator('.about-row .about-row-name').allTextContents(), ['German', 'Chinese']);
  assert.equal(await sheet.locator('.about-steps > li').count(), 3);
  await a.page.screenshot({ path: 'artifacts/v0.13.0-family-page.png', animations: 'disabled' });
  // Escape closes the sheet, returns the focus to About German, and adds nothing.
  await a.page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await focused(about), true, 'the focus back on About German');
  assert.equal(await components(), before, 'reading a page adds nothing');

  // The family's mark and name in its group's heading open the family page, leaving the group as it was (D21); the close button closes it.
  const group = a.page.locator('.window-family.fam-translation');
  const wasOpen = await group.evaluate(node => node.open);
  await a.page.getByRole('button', { name: 'About Languages', exact: true }).click();
  await waitFor(async () => await title() === 'Languages', 'Languages from the window');
  assert.equal(await group.evaluate(node => node.open), wasOpen, 'opening the page does not fold the group');
  await sheet.getByRole('button', { name: 'Close About Languages', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });
  // An Expertise module's page keeps its own term, with no language dropdown and no How it works; a click outside closes it.
  const aboutCs = a.page.locator('.window-module[data-type="computer-science"] .window-about');
  await openFamily(aboutCs);
  await aboutCs.click();
  await waitFor(async () => await title() === 'Computer Science', 'Computer Science’s page');
  assert.equal(await sheet.locator('select').count(), 0);
  assert.equal(await sheet.locator('.about-chain').count(), 0);
  assert.equal(await sheet.locator('.about-facts').count(), 0, 'no Reads, Writes, Best for (D21)');
  assert.equal(await sheet.locator('.about-row .about-pill').count(), 0, 'no applies-to on an Expertise facet (D21)');
  assert.match(await sheet.locator('.about-card').innerText(), /Hello, world/);
  await a.page.mouse.click(5, 5);
  await sheet.waitFor({ state: 'detached' });
  // Text and Context show no facts and no example (D21); Context, already on the page, is reached from the Notes page.
  const aboutText = a.page.locator('.window-module[data-type="text"] .window-about');
  await openFamily(aboutText);
  await aboutText.click();
  for (const name of ['Text', 'Context']) {
    if (name === 'Context') {
      await sheet.locator('.about-path button', { hasText: 'Notes' }).click();
      await waitFor(async () => await title() === 'Notes', 'the Notes page');
      await sheet.locator('.about-row', { hasText: 'Context' }).click();
    }
    await waitFor(async () => await title() === name, `${name}’s page`);
    assert.equal(await sheet.locator('.about-facts, .about-section, .about-card').count(), 0, `${name} shows only its header`);
  }
  await a.page.mouse.click(5, 5);
  await sheet.waitFor({ state: 'detached' });

  // In the facet window a row's › opens the facet's page over the window, which stays open beneath it.
  const facets = await facetWindow(a.page, 'German');
  const info = name => facets.getByRole('button', { name: `About ${name}`, exact: true });
  await info('Article').click();
  await waitFor(async () => await title() === 'Article', 'Article from the facet window');
  await a.page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await facets.isVisible(), true, 'the facet window stays open');
  assert.equal(await focused(info('Article')), true, 'the focus back on its ›');
  assert.deepEqual(await inOrder(facets, 'equipped'), [true, true, true, true, false, false, false, false, false], 'the grammar facets and Pronunciation are not on a My Deck card (K56)');
  await a.page.keyboard.press('Escape');

  // The card's own About opens its module page.
  await cardTab(a.page, 'German').click();
  await componentArticle(a.page, 'German').locator('.card-actions').getByRole('button', { name: 'About German', exact: true }).click();
  await waitFor(async () => await title() === 'German', 'German from its card');
  // Both themes, with forced colours off and on, the sheet keeps its edge and readable text.
  for (const colorScheme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
    await a.page.emulateMedia({ colorScheme, forcedColors });
    await a.page.screenshot({ path: `artifacts/v0.13.0-module-page-${colorScheme}${forcedColors === 'active' ? '-forced' : ''}.png`, animations: 'disabled' });
  }
  await a.page.emulateMedia({ colorScheme: 'light', forcedColors: 'none' });
  await a.page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });

  // Deck settings open the same page, About first among a module's actions.
  const deckId = (await store.page(pageId)).deckId;
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  const row = a.page.locator('.deck-module[data-type="german"]');
  await row.locator('.tab-button').click();
  assert.deepEqual(await row.locator('.card-actions button').allTextContents(), ['About', 'Facet', 'Remove']);
  await row.getByRole('button', { name: 'About German', exact: true }).click();
  await waitFor(async () => await title() === 'German', 'German from deck settings');
  await a.page.keyboard.press('Escape');
});
