// Report a problem: from the account menu on a page, about its German card; the
// report is saved with the page and the logs, then undone. See features/account.md.
const until = async (check, what, timeout = 15000) => {
  for (const start = Date.now(); !(await check());) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${what}`);
    await new Promise(done => setTimeout(done, 100));
  }
};

export default async function ({ page, app, shot, query, json }) {
  const [{ page_id: pageId }] = await query(`SELECT page_id FROM components WHERE module_type = 'german' AND status = 'completed' LIMIT 1`);
  await page.goto(`${app}#page/${pageId}`);
  await page.getByRole('button', { name: 'Page actions', exact: true }).waitFor();
  const before = (await query('SELECT count(*)::int AS reports FROM reports'))[0].reports;

  const trigger = page.getByRole('button', { name: 'Account: admin', exact: true });
  for (let tries = 0; await trigger.getAttribute('aria-expanded') !== 'true'; tries++) {
    if (tries === 3) throw new Error('The account menu did not open.');
    await trigger.press('Enter');
    await page.waitForTimeout(200);
  }
  await shot('account-menu');
  await page.getByRole('button', { name: 'Report a problem…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Report a problem' });
  await dialog.getByRole('group', { name: 'About' }).getByText('German', { exact: true }).click();
  await dialog.getByLabel('What went wrong?').fill('The examples are in English, not German.');
  await shot('report-dialog');
  await dialog.getByRole('button', { name: 'Save report', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Report saved' }).waitFor();
  await shot('report-saved');
  const [saved] = await query("SELECT text, screen, module_type, page IS NOT NULL AS has_page, logs IS NOT NULL AS has_logs FROM reports ORDER BY created_at DESC LIMIT 1");
  await json('saved-report', saved);
  if (saved.module_type !== 'german' || !saved.has_page) throw new Error('The report is not about the German card of the page.');

  await page.getByRole('status').getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Report deleted' }).waitFor();
  await until(async () => (await query('SELECT count(*)::int AS reports FROM reports'))[0].reports === before, 'Undo deletes the report');
  await shot('report-undone');
}
