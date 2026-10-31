// Accounts: sign-in across installations, expired access, the free host, and appearance.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { blockText } from '@vocabularium/domain/pages';
import { text } from '../helpers/pages.mjs';
import { keyOf, apiOrigin, launch, accountMenu, chooseAppearance, signIn, addFromWindow } from './helpers.mjs';

test('account extension: login, two installations, reopening, server failure, and logout', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-account-browser-'));
  const databaseKey = join(directory, 'account-fixture');
  let application = await createTestApplication(t, { databaseKey });
  const contexts = new Set();
  t.after(async () => {
    for (const context of contexts) await context.close().catch(() => { });
    await application.close();
    await rm(directory, { recursive: true, force: true });
  });
  await application.start();
  const aProfile = join(directory, 'a');
  let a = await launch(aProfile); contexts.add(a.context);
  await a.page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await a.page.getByLabel('Username', { exact: true }).fill('admin');
  await a.page.getByLabel('Password', { exact: true }).fill('wrong');
  await a.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await a.page.getByRole('alert').filter({ hasText: 'Username or password is incorrect.' }).waitFor();
  await signIn(a.page);
  await a.page.getByRole('heading', { name: 'My Deck', exact: true }).waitFor();
  const b = await launch(join(directory, 'b')); contexts.add(b.context);
  await signIn(b.page);
  assert.equal((await application.store.account()).decks.length, 1);

  const second = await application.store.createDeck('Second deck');
  await a.page.reload();
  await a.page.getByRole('heading', { name: 'Second deck', exact: true }).waitFor();
  await application.close();
  await a.page.getByLabel('Options for Second deck').click();
  await a.page.locator('article').filter({ hasText: 'Second deck' }).getByRole('button', { name: 'Set as default', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  application = (await createTestApplication(t, { databaseKey })); await application.start();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await a.page.locator('article').filter({ hasText: 'Second deck' }).getByText('Default', { exact: true }).waitFor();
  assert.equal((await application.store.account()).defaultDeckId, second.id);
  await b.page.reload();
  await b.page.locator('article').filter({ hasText: 'Second deck' }).getByText('Default', { exact: true }).waitFor();

  await a.context.close(); contexts.delete(a.context);
  a = await launch(aProfile); contexts.add(a.context);
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.equal((await application.store.account()).decks.length, 2);
  await accountMenu(a.page); await a.page.getByRole('button', { name: 'Log out', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await a.page.reload();
  await a.page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await b.page.reload();
  await b.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
});

test('expired access keeps a page draft and pending operation for explicit replay', { timeout: 30000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-auth-draft-'));
  const application = await createTestApplication(t);
  await application.start();
  const browser = await launch(join(directory, 'profile'));
  t.after(async () => { await browser.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(browser.page);
  const deckId = (await application.store.account()).defaultDeckId;
  const pageId = (await application.store.createPage('auth-draft-fixture', { deckId, mainKey: 'fixture' })).pageId;
  await browser.page.reload();
  await browser.page.goto(`chrome-extension://${browser.id}/app.html#page/${pageId}`);
  await browser.page.getByRole('button', { name: 'Edit Main key', exact: true }).click();
  await browser.page.getByRole('textbox', { name: 'Edit Main key', exact: true }).fill('draft survives expired access');
  const auth = await browser.worker.evaluate(async () => (await chrome.storage.local.get('auth')).auth);
  await application.authentication.logout(auth.token);
  await browser.page.getByRole('button', { name: 'Save', exact: true }).click();
  await browser.page.getByRole('alert').filter({ hasText: 'Sign in to continue.' }).waitFor();
  assert.equal(await browser.page.getByRole('textbox', { name: 'Edit Main key', exact: true }).inputValue(), 'draft survives expired access');
  assert.equal(keyOf(await application.store.page(pageId)), 'fixture');
  const operation = await browser.worker.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).find(([key]) => key.startsWith('save-'))?.[1]);
  assert.equal(operation.state, 'pending');
  assert.equal(blockText(operation.payload.payload.changes[0].content), 'draft survives expired access');
});

test('free host: startup HTML is actionable and an erased account requires fresh sign-in', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-free-host-'));
  let application = await createTestApplication(t);
  let browser;
  t.after(async () => {
    await browser?.context.close();
    await application.close();
    await rm(directory, { recursive: true, force: true });
  });
  const handler = application.server.listeners('request')[0];
  application.server.removeListener('request', handler);
  let waking = true;
  application.server.on('request', (request, response) => {
    if (!waking) return handler(request, response);
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<html>Service starting</html>');
  });
  await application.start();
  browser = await launch(join(directory, 'profile'));
  await browser.page.getByLabel('Username', { exact: true }).fill('admin');
  await browser.page.getByLabel('Password', { exact: true }).fill('admin');
  await browser.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await browser.page.getByRole('alert').filter({ hasText: 'The account server is unavailable or waking up. Wait a minute and try again.' }).waitFor();
  waking = false;
  await signIn(browser.page);
  await application.store.createDeck('Before reset');
  await browser.page.reload();
  await browser.page.getByRole('heading', { name: 'Before reset', exact: true }).waitFor();

  await application.close();
  application = (await createTestApplication(t));
  await application.start();
  await browser.page.reload();
  await browser.page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await signIn(browser.page);
  await browser.page.getByRole('heading', { name: 'My Deck', exact: true }).waitFor();
  assert.equal(await browser.page.getByRole('heading', { name: 'Before reset', exact: true }).count(), 0);
});

test('appearance: all open views, drafts, dialogs, feedback lifetime, logout and browser restart', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-theme-browser-'));
  const application = await createTestApplication(t); await application.start();
  const testingExtension = join(directory, 'extension');
  await cp(resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension'), testingExtension, { recursive: true });
  await appendFile(join(testingExtension, 'background.js'), '\nglobalThis.feedbackForTest = showFeedback;\n');
  let a = await launch(join(directory, 'a'), testingExtension);
  const b = await launch(join(directory, 'b'), testingExtension);
  t.after(async () => { await a.context.close(); await b.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const theme = chooseAppearance;
  // data-appearance is the applied choice: 'system' (the default, D05), 'light' (Sage) or 'dark' (Moss night).
  const hasTheme = (page, value) => page.waitForFunction(value => document.documentElement.dataset.appearance === value &&
    (value === 'system' ? !('theme' in document.documentElement.dataset) : document.documentElement.dataset.theme === value), value);
  const ground = page => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ground').trim());
  await hasTheme(a.page, 'system'); await hasTheme(b.page, 'system');
  // System follows the operating system's setting until the user chooses a theme.
  await b.page.emulateMedia({ colorScheme: 'dark' }); assert.equal(await ground(b.page), '#161a15');
  await b.page.emulateMedia({ colorScheme: 'light' }); assert.equal(await ground(b.page), '#eef3ea');
  await theme(a.page, 'dark');
  await a.page.screenshot({ path: 'artifacts/v0.2.0-login-dark.png', fullPage: true });
  await signIn(a.page);
  await hasTheme(a.page, 'dark'); await hasTheme(b.page, 'system');
  const other = await a.context.newPage(); await other.goto(`chrome-extension://${a.id}/app.html`);
  await hasTheme(other, 'dark');
  await a.page.getByRole('heading', { name: 'My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).click();
  const editor = a.page.getByLabel('Context (optional)', { exact: true });
  await editor.fill('Keep this unsaved draft');
  await editor.evaluate(node => node.setSelectionRange(5, 9));
  await theme(other, 'light'); await hasTheme(a.page, 'light');
  assert.equal(await editor.inputValue(), 'Keep this unsaved draft');
  assert.deepEqual(await editor.evaluate(node => [node.selectionStart, node.selectionEnd]), [5, 9]);
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').waitFor();
  await theme(other, 'dark'); await hasTheme(a.page, 'dark');
  await a.page.getByRole('dialog').screenshot({ path: 'artifacts/v0.2.0-dialog-dark.png' });
  await a.page.getByRole('dialog').getByRole('button', { name: 'Continue editing', exact: true }).click();
  assert.equal(await editor.inputValue(), 'Keep this unsaved draft');
  const reading = await a.context.newPage(); await reading.goto(apiOrigin + '/health');
  const tabId = await a.worker.evaluate(async origin => (await chrome.tabs.query({ url: origin + '/health' }))[0].id, apiOrigin);
  const started = Date.now();
  await a.worker.evaluate(async (tabId) => globalThis.feedbackForTest(tabId, 'Capture received'), tabId);
  await reading.getByRole('status').waitFor();
  assert.equal(await reading.locator('vocabularium-feedback').getAttribute('data-theme'), 'dark');
  await reading.screenshot({ path: 'artifacts/v0.2.0-feedback-dark.png' });
  await theme(other, 'light');
  await reading.waitForFunction(() => document.querySelector('vocabularium-feedback')?.dataset.theme === 'light');
  await reading.screenshot({ path: 'artifacts/v0.2.0-feedback-light.png' });
  assert.equal(await a.worker.evaluate(async (tabId) => {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId }, func: async () => {
        try { await chrome.storage.local.get('theme'); return true; } catch { return false; }
      }
    }); return result.result;
  }, tabId), false, 'injected scripts cannot read trusted local account storage');
  await reading.locator('vocabularium-feedback').waitFor({ state: 'detached', timeout: 4000 });
  assert.ok(Date.now() - started < 4200, 'theme change does not restart feedback lifetime');

  const restrictedPromise = a.context.waitForEvent('page');
  const restrictedId = await a.worker.evaluate(async () => (await chrome.tabs.create({ url: 'chrome://extensions' })).id);
  const restricted = await restrictedPromise; await restricted.waitForLoadState();
  const popupPromise = a.context.waitForEvent('page');
  await a.worker.evaluate(async (id) => globalThis.feedbackForTest(id, 'Capture unavailable.', true), restrictedId);
  const popup = await popupPromise;
  await popup.getByRole('status').waitFor(); await hasTheme(popup, 'light');
  const closePromise = popup.waitForEvent('close');
  await theme(other, 'dark'); await hasTheme(popup, 'dark');
  await popup.screenshot({ path: 'artifacts/v0.2.0-feedback-popup-dark.png' });
  await closePromise;
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await accountMenu(a.page); await a.page.getByRole('button', { name: 'Log out', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Welcome back.' }).waitFor(); await hasTheme(a.page, 'dark');
  await a.context.close();
  a = await launch(join(directory, 'a'), testingExtension);
  await hasTheme(a.page, 'dark'); await signIn(a.page); await hasTheme(a.page, 'dark');
  await a.page.getByRole('button', { name: 'Add new deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).fill('Unsaved configuration');
  await addFromWindow(a.page, 'chinese');
  for (const appearance of ['dark', 'light']) {
    await theme(a.page, appearance);
    assert.equal(await a.page.getByLabel('Deck name', { exact: true }).inputValue(), 'Unsaved configuration');
    assert.equal(await a.page.locator('.deck-module').count(), 4);
    await a.page.screenshot({ path: `artifacts/v0.2.0-configuration-${appearance}.png`, fullPage: true });
  }
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
});
