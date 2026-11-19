// Capture: a word selected on a web page becomes a page whose German card
// completes, and the page opens from Home. See features/capture.md.
const until = async (check, what, timeout = 20000) => {
  for (const start = Date.now(); !(await check());) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${what}`);
    await new Promise(done => setTimeout(done, 100));
  }
};

export default async function ({ page, app, capture, webPage, shot, query, json }) {
  await page.goto(app);
  await page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  await shot('home-before');

  const tab = await webPage();
  await capture('Ufer');
  await tab.close();

  // The side effect first: one page from the selection, its German card completed.
  const rows = () => query(`SELECT p.id, c.module_type, c.status FROM pages p JOIN components c ON c.page_id = p.id
    WHERE p.selected_text = 'Ufer' ORDER BY c.position`);
  await until(async () => (await rows()).some(row => row.module_type === 'german' && row.status === 'completed'), 'the German card completes');
  const stored = await rows();
  await json('stored-components', stored);

  // Then what the user sees: the page, its title and the card.
  await page.goto(`${app}#page/${stored[0].id}`);
  await page.locator('h1.main-key').filter({ hasText: 'Ufer' }).waitFor();
  await page.locator('article.component').filter({ has: page.getByRole('heading', { name: 'German', exact: true }) }).waitFor();
  await shot('page-with-card');
}
