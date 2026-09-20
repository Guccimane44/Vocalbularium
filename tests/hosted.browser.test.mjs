import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

test('hosted candidate: two real installations and synchronized card editing', {
  skip: !process.env.VOCABULARIUM_API_URL, timeout: 120000
}, async t => {
  const origin = new URL(process.env.VOCABULARIUM_API_URL).origin;
  assert.equal(new URL(origin).protocol, 'https:');
  const extension = resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension');
  assert.ok((await readFile(join(extension, 'config.js'), 'utf8')).includes(JSON.stringify(origin)), 'Build the candidate for this test origin first.');
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-hosted-browser-'));
  const contexts = [];
  const interfaceOnly = process.env.VOCABULARIUM_HOSTED_CHECK === 'interface';
  let cleanupPage, cleanupURL, cleanupDeckURL;
  t.after(async () => {
    try {
      if (cleanupURL) {
        await cleanupPage.goto(cleanupURL);
        await cleanupPage.getByRole('button', { name: 'Edit card manually', exact: true }).click();
        await cleanupPage.getByRole('button', { name: 'Delete card', exact: true }).click();
        await cleanupPage.getByRole('dialog').getByRole('button', { name: 'Delete card', exact: true }).click();
        await cleanupPage.getByRole('button', { name: 'Add card manually', exact: true }).waitFor();
      }
      if (cleanupDeckURL) {
        await cleanupPage.goto(cleanupDeckURL);
        await cleanupPage.locator('.deck-menu summary').click();
        await cleanupPage.getByRole('button', { name: 'Delete deck', exact: true }).click();
        await cleanupPage.getByRole('dialog').getByRole('button', { name: 'Delete deck', exact: true }).click();
        await cleanupPage.getByRole('heading', { name: 'Your decks.' }).waitFor();
      }
    } finally {
      for (const context of contexts) await context.close().catch(() => {});
      await rm(directory, { recursive: true, force: true });
    }
  });
  async function launch(name) {
    const context = await chromium.launchPersistentContext(join(directory, name), {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    contexts.push(context);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/app.html`);
    await page.getByLabel('Username', { exact: true }).fill('admin');
    await page.getByLabel('Password', { exact: true }).fill('admin');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Your decks.' }).waitFor();
    return page;
  }
  const a = await launch('a'), b = await launch('b');
  if (interfaceOnly) {
    const deckName = `Interface check ${Date.now()}`;
    await a.getByRole('button', { name: 'Add new deck', exact: true }).click();
    await a.getByLabel('Deck name', { exact: true }).fill(deckName);
    await a.getByRole('button', { name: 'Save', exact: true }).click();
    await a.getByRole('heading', { name: deckName, exact: true }).click();
    cleanupPage = a; cleanupDeckURL = a.url();
    await b.reload();
    await b.getByRole('heading', { name: deckName, exact: true }).click();
    await a.getByLabel('Appearance', { exact: true }).selectOption('dark');
    await a.reload();
    await a.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await a.getByLabel('Appearance', { exact: true }).inputValue(), 'dark');
    assert.equal(await b.getByLabel('Appearance', { exact: true }).inputValue(), 'light');
  } else for (const page of [a, b]) {
    await page.locator('article.capture').filter({ has: page.getByText('幸福', { exact: true }) }).last().getByRole('button', { name: 'Open card', exact: true }).click();
    assert.equal(await page.locator('pre').textContent(), '幸福');
    await page.getByRole('button', { name: 'Page 2', exact: true }).click();
    await page.locator('pre').filter({ hasText: '=== Beispiele ===' }).waitFor();
    await page.getByRole('button', { name: '← My Deck', exact: true }).click();
  }
  const title = `Hosted browser check ${Date.now()}`;
  await a.getByRole('button', { name: 'Add card manually', exact: true }).click();
  await a.getByLabel('Page 1 content', { exact: true }).fill(title);
  await a.getByRole('button', { name: 'Page 2', exact: true }).click();
  await a.getByLabel('Page 2 content', { exact: true }).fill('Saved in the first installation.');
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await a.getByRole('button', { name: 'Edit card manually', exact: true }).waitFor();
  cleanupPage = a; cleanupURL = a.url();
  // Creating a card opens its front page. Observe page 2 before checking its remote edit.
  await a.getByRole('button', { name: 'Page 2', exact: true }).click();
  await a.locator('pre').filter({ hasText: 'Saved in the first installation.' }).waitFor();
  await b.getByRole('button', { name: title, exact: true }).click();
  await b.getByRole('button', { name: 'Page 2', exact: true }).click();
  assert.equal(await b.locator('pre').textContent(), 'Saved in the first installation.');
  await b.getByRole('button', { name: 'Edit card manually', exact: true }).click();
  await b.getByLabel('Page 2 content', { exact: true }).fill('Edited in the second installation.');
  await b.getByRole('button', { name: 'Save', exact: true }).click();
  await b.getByRole('button', { name: 'Edit card manually', exact: true }).waitFor();
  await a.locator('pre').filter({ hasText: 'Edited in the second installation.' }).waitFor();
  await a.getByRole('button', { name: 'Edit card manually', exact: true }).click();
  await a.getByRole('button', { name: 'Delete card', exact: true }).click();
  await a.getByRole('dialog').getByRole('button', { name: 'Delete card', exact: true }).click();
  await a.getByRole('button', { name: 'Add card manually', exact: true }).waitFor();
  cleanupURL = undefined;
  if (interfaceOnly) {
    assert.equal(await a.locator('.card-row').count(), 0);
    await a.locator('.deck-menu summary').click();
    await a.getByRole('button', { name: 'Delete deck', exact: true }).click();
    await a.getByRole('dialog').getByRole('button', { name: 'Delete deck', exact: true }).click();
    await a.getByRole('heading', { name: 'Your decks.' }).waitFor();
    cleanupDeckURL = undefined;
  }
  await mkdir('.data', { recursive: true });
  await writeFile('.data/hosted-browser-smoke.json', JSON.stringify({
    date: new Date().toISOString(), origin, browser: contexts[0].browser().version(),
    checks: [interfaceOnly ? 'Disposable deck created; existing decks/default preserved; independent themes persist' : 'Generated pages displayed in two real extension installations',
      'Manual card created and synchronized', 'Remote page edit refreshed in the first installation',
      'Manual test card deleted through the extension', ...(interfaceOnly ? ['Disposable deck deleted through its card-list menu'] : [])],
    result: 'passed'
  }, null, 2) + '\n');
  console.log(`Hosted browser evidence: ${interfaceOnly ? 'independent themes and disposable deck cleanup' : 'generated pages'} verified in two profiles; manual card saved, synchronized, edited remotely, and deleted through the real candidate.`);
});
