// Every view below Home leads back up with the same link a page has (0.16.2):
// a deck and diagnostics to Home, deck settings to its deck, a new deck to Home.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, signIn, waitFor } from './helpers.mjs';

test('back links: a deck and diagnostics lead Home, deck settings lead to the deck, a new deck Home; settings are titled by the deck', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-back-links-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const deckId = (await application.store.snapshot()).id;
  const app = hash => `chrome-extension://${a.id}/app.html#${hash}`;
  const at = hash => waitFor(async () => new URL(a.page.url()).hash === hash, `at ${hash || 'Home'}`);
  const back = name => a.page.getByRole('button', { name, exact: true });
  await signIn(a.page);

  // A deck leads Home.
  await a.page.goto(app(`deck/${deckId}`));
  await a.page.getByRole('heading', { level: 1, name: 'My Deck' }).waitFor();
  await back('← Home').click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  await at('');

  // Diagnostics leads Home; its actions no longer hold a Back to decks.
  await a.page.goto(app('diagnostics'));
  await a.page.getByRole('heading', { name: 'Diagnostic logs', exact: true }).waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Back to decks' }).count(), 0);
  await back('← Home').click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();

  // Deck settings are titled by the deck and lead back to it, discarding the draft as Cancel does.
  await a.page.goto(app(`configure/${deckId}`));
  await a.page.getByRole('heading', { level: 1, name: 'My Deck' }).waitFor();
  await a.page.getByLabel('Deck name', { exact: true }).fill('Renamed');
  assert.equal(await a.page.getByRole('heading', { level: 1 }).innerText(), 'My Deck', 'the title keeps the saved name');
  await back('← My Deck').click();
  await at(`#deck/${deckId}`);
  await a.page.getByRole('heading', { level: 1, name: 'My Deck' }).waitFor();
  assert.equal((await application.store.deck(deckId)).name, 'My Deck', 'nothing saved');

  // A new deck is titled so and leads Home.
  await a.page.goto(app('configure/new'));
  await a.page.getByRole('heading', { level: 1, name: 'New deck' }).waitFor();
  await back('← Home').click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
});
