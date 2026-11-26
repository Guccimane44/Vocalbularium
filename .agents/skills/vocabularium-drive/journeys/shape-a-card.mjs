// A page and its cards: on a completed German page, a facet is added or removed in the
// facet window, the card folds from Actions, a Joke card is added from the module window
// and completes, then is deleted after its question. Needs `launch --seed full`.
// See features/page-and-cards.md.
import { pageReady, componentArticle, cardButton, facetWindow, tick, addFromWindow } from '../../../../tests/browser/helpers.mjs';

const until = async (check, what, timeout = 20000) => {
  for (const start = Date.now(); !(await check());) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${what}`);
    await new Promise(done => setTimeout(done, 100));
  }
};

export default async function ({ page, app, shot, query, json }) {
  // The oldest such page is the seed's, whatever other journeys captured since.
  const found = await query(`SELECT c.page_id, c.id FROM components c JOIN pages p ON p.id = c.page_id
    WHERE c.module_type = 'german' AND c.status = 'completed' ORDER BY p.created_at, p.id LIMIT 1`);
  if (!found.length) throw new Error('No completed German card: launch with --seed full.');
  const [{ page_id: pageId, id: germanId }] = found;
  const rows = () => query('SELECT id, module_type, position, status, facets FROM components WHERE page_id = $1 ORDER BY position', [pageId]);
  const facetsOf = async () => JSON.stringify((await rows()).find(row => row.id === germanId)?.facets);
  await page.goto(`${app}#page/${pageId}`);
  // A reload drops what an earlier journey left open or folded on this page.
  await page.reload();
  await pageReady(page);
  await shot('page');

  // A facet, from the facet window: Synonyms goes on if it is off, off if it is on.
  const before = await facetsOf();
  const window = await facetWindow(page, 'German');
  const synonyms = tick(window, 'Synonyms');
  const adding = (await synonyms.getAttribute('aria-label')) === 'Add Synonyms';
  await synonyms.click();
  await window.getByRole('button', { name: `${adding ? 'Remove' : 'Add'} Synonyms`, exact: true }).waitFor();
  await until(async () => (await facetsOf()) !== before, 'the German facets change in the database');
  await shot(adding ? 'synonyms-added' : 'synonyms-removed');
  await json('german-facets', { before: JSON.parse(before ?? 'null'), after: JSON.parse(await facetsOf() ?? 'null') });
  await page.keyboard.press('Escape');

  // Fold, from Actions: the entry then reads the other way. A fold outlives a reload,
  // so an earlier run may have left the card folded; toggle whichever it is.
  const fold = await cardButton(page, 'Fold German');
  const folding = (await fold.count()) > 0;
  await (folding ? fold : page.getByRole('button', { name: 'Unfold German', exact: true })).click();
  await (await cardButton(page, folding ? 'Unfold German' : 'Fold German')).waitFor();
  await shot(folding ? 'german-folded' : 'german-unfolded');
  await page.keyboard.press('Escape');

  // A module from the window: dragged to the end, it lands as an empty card that waits
  // for Retry; an empty card's Retry starts at once, without a question.
  // The drive browser is attached over CDP and has no viewport of its own, which addFromWindow reads.
  await page.setViewportSize({ width: 1280, height: 1400 });
  await addFromWindow(page, 'joke');
  await until(async () => (await rows()).some(row => row.module_type === 'joke'), 'the Joke row is added');
  const joke = componentArticle(page, 'Joke');
  await joke.waitFor();
  await shot('joke-added');
  await (await cardButton(page, 'Retry Joke')).click();
  await until(async () => (await rows()).some(row => row.module_type === 'joke' && row.status === 'completed'), 'the Joke card completes');
  await shot('joke-generated');

  // Delete, from Actions: a card with content asks first.
  await (await cardButton(page, 'Delete Joke')).click();
  await page.getByRole('button', { name: 'Yes, delete Joke', exact: true }).click();
  await until(async () => !(await rows()).some(row => row.module_type === 'joke'), 'the Joke row is deleted');
  await joke.waitFor({ state: 'detached' });
  await json('components-after', await rows());
  await shot('joke-deleted');
}
