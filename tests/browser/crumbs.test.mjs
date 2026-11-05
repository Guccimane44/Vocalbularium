// Every view below Home shows its trail from Home (0.16.2; a back link
// before): Home › the deck › the view, every crumb but the last a link, the
// owner's text cut to a limit with its full text as a tooltip.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staged } from '../helpers/pages.mjs';
import { BANK, componentArticle, crumb, launch, signIn, waitFor } from './helpers.mjs';

test('breadcrumbs: a deck, its settings from Home and from its page, a page, a new page, a new deck and diagnostics', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-crumbs-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  const deckId = (await store.snapshot()).id;
  const session = { installationId: 'fixture', sessionId: 'crumbs', epoch: 1 };
  await store.openSession('crumbs-session', session);
  const long = 'Die Gesundheit meiner Familie ist mein größtes Glück, sagte sie leise';
  const { pageId } = await store.capture('crumbs-capture', { session, mainKey: long, snapshot: await store.snapshot() });
  const german = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  await store.stage(german.attemptId, staged(BANK));
  await store.publish('crumbs-publish', { attemptId: german.attemptId, session });
  const app = hash => `chrome-extension://${a.id}/app.html#${hash}`;
  const at = hash => waitFor(async () => new URL(a.page.url()).hash === hash, `at ${hash || 'Home'}`);
  const trail = () => a.page.getByRole('navigation', { name: 'Where you are', exact: true }).locator('li').evaluateAll(items => items.map(item => {
    const node = item.firstElementChild;
    return [node.textContent, node.tagName === 'A' ? 'link' : node.getAttribute('aria-current')];
  }));
  // A view's trail, once it shows: the previous view's can stand for a moment on a slow machine.
  const expectTrail = (expected, message = 'the trail') => waitFor(async () => JSON.stringify(await trail()) === JSON.stringify(expected), `${message}: ${JSON.stringify(expected)}`);
  await signIn(a.page);

  // A deck: Home › My Deck.
  await a.page.goto(app(`deck/${deckId}`));
  await a.page.getByRole('heading', { level: 1, name: 'My Deck' }).waitFor();
  await expectTrail([['Home', 'link'], ['My Deck', 'page']]);
  assert.equal(await a.page.locator('button.back').count(), 0, 'no back link');

  // Deck settings from the deck's page and from Home alike: Home › My Deck › Deck settings; a crumb leaves as Cancel does.
  await a.page.getByRole('group', { name: 'Options for My Deck', exact: true }).getByRole('button', { name: 'Configure deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).waitFor();
  await expectTrail([['Home', 'link'], ['My Deck', 'link'], ['Deck settings', 'page']]);
  await a.page.getByLabel('Deck name', { exact: true }).fill('Renamed');
  await crumb(a.page, 'My Deck').click();
  await at(`#deck/${deckId}`);
  assert.equal((await store.deck(deckId)).name, 'My Deck', 'nothing saved');
  await crumb(a.page, 'Home').click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  await a.page.locator('.deck-slot').first().getByRole('button', { name: 'Configure deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).waitFor();
  await expectTrail([['Home', 'link'], ['My Deck', 'link'], ['Deck settings', 'page']], 'the same trail from Home');
  await crumb(a.page, 'Home').click();
  await at('');

  // A page: Home › My Deck › its main key, cut to the limit, its whole text in the tooltip.
  await a.page.goto(app(`page/${pageId}`));
  await componentArticle(a.page, 'German').waitFor();
  // The previous view's trail can still stand for a moment on a slow machine: wait for the page's own.
  await waitFor(async () => (await trail())[2]?.[0]?.endsWith('…'), 'the page’s trail');
  const [, , [shown]] = await trail();
  assert.equal(Array.from(shown).length, 32, 'cut to 32 characters');
  assert.ok(shown.endsWith('…') && long.startsWith(shown.slice(0, -1).trimEnd()));
  assert.equal(await a.page.locator('.crumbs [aria-current="page"]').getAttribute('title'), long);
  await crumb(a.page, 'My Deck').click();
  await at(`#deck/${deckId}`);

  // A new page: Home › My Deck › New page.
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).click();
  await a.page.getByLabel('Main key', { exact: true }).waitFor();
  await expectTrail([['Home', 'link'], ['My Deck', 'link'], ['New page', 'page']]);

  // A new deck: Home › New deck; diagnostics: Home › Diagnostic logs.
  await a.page.goto(app('configure/new'));
  await a.page.getByRole('heading', { level: 1, name: 'New deck' }).waitFor();
  await expectTrail([['Home', 'link'], ['New deck', 'page']]);
  await a.page.goto(app('diagnostics'));
  await a.page.getByRole('heading', { name: 'Diagnostic logs', exact: true }).waitFor();
  await expectTrail([['Home', 'link'], ['Diagnostic logs', 'page']]);
  await crumb(a.page, 'Home').click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
});
