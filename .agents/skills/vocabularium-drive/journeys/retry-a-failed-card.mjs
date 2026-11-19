// Retry: a card whose generation failed is retried from its page and completes.
// Needs `launch --seed full`, whose seed holds a failed page for each module group.
// See features/retry.md.
const until = async (check, what, timeout = 20000) => {
  for (const start = Date.now(); !(await check());) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${what}`);
    await new Promise(done => setTimeout(done, 100));
  }
};

export default async function ({ page, app, shot, query, json }) {
  const failed = await query(`SELECT page_id, id FROM components WHERE module_type = 'german' AND status = 'failed' LIMIT 1`);
  if (!failed.length) throw new Error('No failed German card: launch with --seed full.');
  const [{ page_id: pageId, id: componentId }] = failed;
  await page.goto(`${app}#page/${pageId}`);
  const card = page.locator('article.component').filter({ has: page.getByRole('heading', { name: 'German', exact: true }) });
  await card.locator('.list-status').filter({ hasText: 'Generation failed' }).waitFor();
  await shot('failed-card');

  await card.getByRole('button', { name: 'Retry German', exact: true }).click();
  // A card with content asks first; a failed one may not.
  const confirm = page.getByRole('button', { name: 'Yes, retry German', exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();

  const status = async () => (await query('SELECT status FROM components WHERE page_id = $1 AND id = $2', [pageId, componentId]))[0]?.status;
  await until(async () => (await status()) === 'completed', 'the retried card completes');
  await json('component-after-retry', await query('SELECT module_type, status FROM components WHERE page_id = $1 AND id = $2', [pageId, componentId]));
  await card.locator('.list-status').waitFor({ state: 'detached' });
  await shot('card-after-retry');
}
