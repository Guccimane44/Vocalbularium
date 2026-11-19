// Report a problem (D336): from the account menu, about a card of the page shown,
// saved with the page and the logs; Undo deletes it; off a page it is about the screen.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capture, useModules } from '../helpers/pages.mjs';
import { launch, accountMenu, signIn, waitFor, pageReady } from './helpers.mjs';

const session = { installationId: 'report-fixture', sessionId: 'report', epoch: 1 };

test('report a problem: about a card, saved with the page and logs, undone; off a page, about the screen', { timeout: 60000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-report-browser-'));
  const application = await createTestApplication(t, { databaseKey: join(directory, 'account') });
  const contexts = new Set();
  t.after(async () => {
    for (const context of contexts) await context.close().catch(() => {});
    await application.close();
    await rm(directory, { recursive: true, force: true });
  });
  await application.start();
  const { store } = application;
  await store.openSession('open', session);
  await useModules(store, ['german']);
  const { pageId } = await capture(store, 'capture', session, 'Ufer');
  const german = (await store.page(pageId)).components.find(component => component.moduleType === 'german');

  const browser = await launch(join(directory, 'profile')); contexts.add(browser.context);
  const { page, id } = browser;
  await signIn(page);
  await page.goto(`chrome-extension://${id}/app.html#page/${pageId}`);
  await pageReady(page);

  // The item sits right under Diagnostic logs.
  await accountMenu(page);
  const items = await page.locator('#account-panel .account-main .menu-action').allTextContents();
  assert.deepEqual(items.slice(items.indexOf('Diagnostic logs')), ['Diagnostic logs', 'Report a problem…', 'Log out']);
  await page.getByRole('button', { name: 'Report a problem…', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Report a problem' });
  await dialog.waitFor();
  const about = dialog.getByRole('group', { name: 'About' });
  assert.deepEqual(await about.getByRole('radio').evaluateAll(radios => radios.map(radio => radio.closest('label')?.textContent)), ['The whole page', 'German']);
  assert.equal(await about.getByRole('radio', { name: 'The whole page' }).isChecked(), true, 'the whole page is chosen first');
  const save = dialog.getByRole('button', { name: 'Save report', exact: true });
  assert.equal(await save.isDisabled(), true, 'nothing to save without words');
  await about.getByText('German', { exact: true }).click();
  await dialog.getByLabel('What went wrong?').fill('The examples are in English.');
  assert.equal(await dialog.getByRole('checkbox', { name: 'Diagnostic logs from the last 15 minutes' }).isChecked(), true);
  await save.click();

  const notice = page.getByRole('status').filter({ hasText: 'Report saved' });
  await notice.waitFor();
  assert.equal(await dialog.count(), 0, 'the dialog closes');
  let [report] = await store.unfiledReports();
  assert.deepEqual([report.text, report.screen, report.page_id, report.component_id, report.module_type], ['The examples are in English.', 'page', pageId, german.id, 'german']);
  assert.equal(JSON.parse(report.page).id, pageId);
  assert.ok(Array.isArray(JSON.parse(report.logs)), 'the logs went with it');
  assert.ok(JSON.parse(report.builds).extension.commit, 'the extension named its build');

  await notice.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Report deleted' }).waitFor();
  await waitFor(async () => (await store.unfiledReports()).length === 0, 'Undo deletes the report');

  // Off a page: about this screen, without the page, and here without the logs.
  await page.goto(`chrome-extension://${id}/app.html`);
  await page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  await accountMenu(page);
  await page.getByRole('button', { name: 'Report a problem…', exact: true }).click();
  await dialog.waitFor();
  assert.deepEqual(await dialog.getByRole('group', { name: 'About' }).getByRole('radio').evaluateAll(radios => radios.map(radio => radio.closest('label')?.textContent)), ['This screen']);
  assert.equal(await dialog.getByText('This page and its cards, as they are now').count(), 0);
  await dialog.getByLabel('What went wrong?').fill('Home is slow.');
  await dialog.getByRole('checkbox', { name: 'Diagnostic logs from the last 15 minutes' }).uncheck();
  await dialog.getByRole('button', { name: 'Save report', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Report saved' }).waitFor();
  [report] = await store.unfiledReports();
  assert.deepEqual([report.screen, report.page_id, report.page, report.logs], ['home', null, null, null]);

  // Escape or Cancel keeps nothing.
  await accountMenu(page);
  await page.getByRole('button', { name: 'Report a problem…', exact: true }).click();
  await dialog.getByLabel('What went wrong?').fill('Never mind.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await dialog.count(), 0);
  assert.equal((await store.unfiledReports()).length, 1);
});
