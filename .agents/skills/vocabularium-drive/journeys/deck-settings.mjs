// Decks: from Home, Reading list is configured (renamed and recoloured), then made the
// default; My Deck's existing pages are untouched. Needs `launch --seed full`, and
// leaves Reading list renamed and default. See features/decks.md.
const until = async (check, what, timeout = 15000) => {
  for (const start = Date.now(); !(await check());) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${what}`);
    await new Promise(done => setTimeout(done, 100));
  }
};

export default async function ({ page, app, shot, query, json }) {
  const decks = () => query('SELECT id, name, colour FROM decks ORDER BY ordinal');
  const reading = (await decks()).find(deck => deck.name === 'Reading list');
  if (!reading) throw new Error('No Reading list deck: launch with --seed full.');
  const pagesBefore = await query('SELECT deck_id, count(*)::int AS pages FROM pages GROUP BY deck_id ORDER BY deck_id');
  await page.goto(app);
  await page.reload();
  await page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  await shot('home');

  // Configure: the deck's own settings, from its card on Home.
  await page.getByRole('group', { name: 'Options for Reading list', exact: true }).getByRole('button', { name: 'Configure deck', exact: true }).click();
  await page.getByLabel('Deck name', { exact: true }).fill('Weekend reading');
  const colour = reading.colour === 'roots' ? 'Rose' : 'Amber';
  // A swatch's name is hidden text under its radio, so choose the radio itself.
  await page.getByRole('group', { name: 'Deck colour', exact: true }).getByRole('radio', { name: colour, exact: true }).check();
  await shot('deck-settings');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Your decks', exact: true }).or(page.getByRole('heading', { name: 'Weekend reading', exact: true })).first().waitFor();
  await until(async () => (await decks()).find(deck => deck.id === reading.id)?.name === 'Weekend reading', 'the deck is renamed');
  const saved = (await decks()).find(deck => deck.id === reading.id);
  if (saved.colour === reading.colour) throw new Error('The deck colour did not change.');

  // Set as default, from its card on Home.
  await page.goto(app);
  await page.getByRole('group', { name: 'Options for Weekend reading', exact: true }).getByRole('button', { name: 'Set as default', exact: true }).click();
  await until(async () => (await query('SELECT default_deck_id FROM account'))[0].default_deck_id === reading.id, 'the deck becomes the default');
  await shot('weekend-reading-default');

  const pagesAfter = await query('SELECT deck_id, count(*)::int AS pages FROM pages GROUP BY deck_id ORDER BY deck_id');
  if (JSON.stringify(pagesAfter) !== JSON.stringify(pagesBefore)) throw new Error('Configuring a deck changed which pages exist.');
  await json('decks-after', { decks: await decks(), default: (await query('SELECT default_deck_id FROM account'))[0].default_deck_id, pages: pagesAfter });
}
