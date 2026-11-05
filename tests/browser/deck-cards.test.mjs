// A deck on the home page as a card (0.16.2, the accepted canvas, A1): behind
// its top edge a little module card per family its modules come from, which
// rise and lean apart while the deck is pointed at; its actions as symbols.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, signIn, waitFor } from './helpers.mjs';

test('deck cards: families behind the card rise on hover; Set as default, Configure deck and Delete deck as symbols', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-deck-cards-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await application.store.createDeck('Second deck');
  await signIn(a.page);
  const slot = name => a.page.locator('.deck-slot').filter({ has: a.page.getByRole('heading', { name, exact: true }) });

  // My Deck holds the main key, Context and German: Languages and Notes, named for screen readers.
  const families = slot('My Deck').getByRole('img', { name: 'Module families: Languages and Notes', exact: true });
  await families.waitFor();
  assert.deepEqual(await families.locator('.deck-family').evaluateAll(cards => cards.map(card => card.className)), ['deck-family fam-translation', 'deck-family fam-notes']);
  // At rest the little cards wait behind the edge; pointed at, the deck lifts and they rise and lean.
  await a.page.mouse.move(5, 5);
  const rest = await families.locator('.deck-family').first().evaluate(node => new DOMMatrix(getComputedStyle(node).transform));
  assert.equal(Math.round(rest.f), 22, 'tucked 22 px down');
  await slot('My Deck').locator('article.deck').hover();
  await waitFor(async () => {
    const lifted = await families.locator('.deck-family').first().evaluate(node => new DOMMatrix(getComputedStyle(node).transform));
    return lifted.f < 0 && Math.abs(lifted.b) > 0.05;
  }, 'the family cards rise and lean');
  const cardTop = await slot('My Deck').locator('article.deck').boundingBox(), familyTop = await families.locator('.deck-family').first().boundingBox();
  assert.ok(familyTop.y < cardTop.y, 'risen above the deck’s top edge');

  // The default deck shows a filled star and its word; another deck offers Set as default, and each Configure and Delete.
  const mine = slot('My Deck').getByRole('group', { name: 'Options for My Deck', exact: true });
  assert.equal(await mine.locator('.deck-star.is-default').innerText(), 'Default');
  assert.deepEqual(await mine.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), ['Configure deck', 'Delete deck']);
  const other = slot('Second deck').getByRole('group', { name: 'Options for Second deck', exact: true });
  assert.deepEqual(await other.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), ['Set as default', 'Configure deck', 'Delete deck']);
  await other.getByRole('button', { name: 'Set as default', exact: true }).click();
  await waitFor(async () => await other.locator('.deck-star.is-default').count() === 1, 'Second deck is the default');
  await other.getByRole('button', { name: 'Configure deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).waitFor();
});
