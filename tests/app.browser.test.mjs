import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createApplication } from '../src/server/app.mjs';

async function launch(profile, extension = resolve('extension')) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/app.html`);
  return { context, page, id, worker };
}
async function signIn(page) {
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'A growing collection.' }).waitFor();
}

test('account extension: login, two installations, reopening, server failure, and logout', { timeout: 45000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-account-browser-'));
  const filename = join(directory, 'account.sqlite');
  let application = createApplication({ filename });
  const contexts = new Set();
  t.after(async () => {
    for (const context of contexts) await context.close().catch(() => {});
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
  assert.equal(application.store.account().decks.length, 1);

  const second = application.store.createDeck('Second deck');
  await a.page.reload();
  await a.page.getByRole('heading', { name: 'Second deck', exact: true }).waitFor();
  await application.close();
  await a.page.getByLabel('Options for Second deck').click();
  await a.page.locator('article').filter({ hasText: 'Second deck' }).getByRole('button', { name: 'Set as default', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  application = createApplication({ filename }); await application.start();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await a.page.locator('article').filter({ hasText: 'Second deck' }).getByText('DEFAULT DECK', { exact: true }).waitFor();
  assert.equal(application.store.account().defaultDeckId, second.id);
  await b.page.reload();
  await b.page.locator('article').filter({ hasText: 'Second deck' }).getByText('DEFAULT DECK', { exact: true }).waitFor();

  await a.context.close(); contexts.delete(a.context);
  a = await launch(aProfile); contexts.add(a.context);
  await a.page.getByRole('heading', { name: 'A growing collection.' }).waitFor();
  assert.equal(application.store.account().decks.length, 2);
  await a.page.getByRole('button', { name: 'Log out', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await a.page.reload();
  await a.page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await b.page.reload();
  await b.page.getByRole('heading', { name: 'A growing collection.' }).waitFor();
});

async function waitFor(predicate, message, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${message}`);
}
async function captureFrom(browser, text) {
  return browser.worker.evaluate(async text => {
    const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1:4318/health' });
    return globalThis.captureForTest({ menuItemId: 'capture', selectionText: text }, tabs[0]);
  }, text);
}

test('capture extension: receipt lifetime, exact duplicate cards, shared outcomes, interruption, and unsaved capture recovery', { timeout: 65000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-capture-browser-'));
  const filename = join(directory, 'account.sqlite');
  const testingExtension = join(directory, 'extension');
  await cp(resolve('extension'), testingExtension, { recursive: true });
  await appendFile(join(testingExtension, 'background.js'), '\nglobalThis.captureForTest = handleCapture;\n');
  const held = new Map();
  const provider = {
    async interpret(text, signal) {
      if (text.includes('held')) await new Promise((resolve, reject) => {
        held.set(text, resolve); signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
      });
      if (text === 'fail') throw Error('controlled interpretation failure');
      return { inputType: text === '我真的很幸福' ? 'sentence' : 'word_phrase', sourceLanguage: 'Chinese' };
    },
    async generate() { return '== Chinesisch ==\n=== Bedeutungen ===\n: [1] Glück\n=== Beispiele ===\n: [1] 她很幸福。\n:: Sie ist glücklich.'; }
  };
  let application = createApplication({ filename, provider });
  await application.start();
  const contexts = new Set();
  t.after(async () => {
    for (const context of contexts) await context.close().catch(() => {});
    await application.close(); await rm(directory, { recursive: true, force: true });
  });
  const profile = join(directory, 'a');
  let a = await launch(profile, testingExtension); contexts.add(a.context); await signIn(a.page);
  const b = await launch(join(directory, 'b'), testingExtension); contexts.add(b.context); await signIn(b.page);
  let reading = await a.context.newPage(); await reading.goto('http://127.0.0.1:4318/health');
  await reading.setContent('<p id="selection">  幸福\n</p>');
  const selected = await reading.locator('#selection').evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node); getSelection().removeAllRanges(); getSelection().addRange(range); return getSelection().toString();
  });
  await captureFrom(a, selected); await captureFrom(a, selected);
  assert.equal(await reading.getByRole('status').count(), 2);
  await reading.getByRole('button', { name: 'Close capture feedback' }).first().click();
  assert.equal(await reading.getByRole('status').count(), 1);
  await reading.getByRole('status').waitFor({ state: 'detached', timeout: 4500 });
  await waitFor(() => application.store.cards().filter(card => card.status === 'completed').length === 2, 'duplicate word cards completed');
  assert.equal(application.store.cards()[0].selected_text, selected);
  assert.equal(application.store.cards()[0].pages[0].text, selected);
  await b.page.reload();
  assert.equal(await b.page.getByRole('button', { name: 'Open card', exact: true }).count(), 2);
  await b.page.getByRole('button', { name: 'Open card', exact: true }).first().click();
  await b.page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await b.page.locator('pre').filter({ hasText: '=== Bedeutungen ===' }).waitFor();
  assert.equal(await b.page.locator('.card-page h2').count(), 0);

  await captureFrom(a, '我真的很幸福'); await captureFrom(a, 'fail');
  await waitFor(() => application.store.cards().find(card => card.selected_text === 'fail')?.status === 'failed', 'failed interpretation persisted');
  const sentenceCard = application.store.cards().find(card => card.selected_text === '我真的很幸福');
  assert.equal(sentenceCard.pages[1].text, ''); assert.equal(sentenceCard.status, 'completed');

  await captureFrom(a, 'held-after-close');
  await a.page.close();
  held.get('held-after-close')();
  await waitFor(() => application.store.cards().find(card => card.selected_text === 'held-after-close')?.status === 'completed', 'dashboard closure leaves generation running');

  await captureFrom(a, 'held-interrupted');
  const interrupted = application.store.cards().find(card => card.selected_text === 'held-interrupted');
  await waitFor(() => application.store.card(interrupted.id).pages[0].status === 'completed', 'completed front before exit');
  await a.context.close(); contexts.delete(a.context);
  held.get('held-interrupted')();
  await waitFor(() => application.store.attempt(interrupted.pages[1].attempt_id).result, 'late provider result staged');
  a = await launch(profile, testingExtension); contexts.add(a.context);
  await a.page.getByRole('heading', { name: 'A growing collection.' }).waitFor();
  assert.deepEqual(application.store.card(interrupted.id).pages.map(page => page.status), ['completed', 'failed']);

  reading = await a.context.newPage(); await reading.goto('http://127.0.0.1:4318/health');
  await application.close();
  const pendingId = await captureFrom(a, 'not saved yet');
  await a.page.reload();
  // Cached account views remain accessible when the refresh fails.
  const receipt = await a.worker.evaluate(async id => (await chrome.storage.local.get(`capture-${id}`))[`capture-${id}`], pendingId);
  assert.equal(receipt.state, 'pending');
  application = createApplication({ filename, provider }); await application.start();
  await a.page.reload();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await waitFor(() => application.store.cards().find(card => card.selected_text === 'not saved yet')?.status === 'completed', 'explicit unsaved capture recovery');
  assert.equal(application.store.cards().filter(card => card.selected_text === 'not saved yet').length, 1);
});

test('deck UI: draft previews, all modules, page limits, content-loss confirmation, and default deletion', { timeout: 40000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-decks-browser-'));
  const application = createApplication(); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  await a.page.getByRole('button', { name: 'Add new deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).fill('Discard this draft');
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(application.store.account().decks.length, 1);

  await a.page.getByRole('button', { name: 'Add new deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).fill('Everyday Chinese');
  await a.page.getByLabel('Number of pages', { exact: true }).selectOption('4');
  assert.equal(await a.page.locator('.preview').count(), 4);
  assert.equal(await a.page.getByRole('button', { name: 'Remove this page', exact: true }).count(), 0);
  await a.page.getByRole('button', { name: 'Add <The selected + original language tag>', exact: true }).click();
  await a.page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add <German explanation>', exact: true }).click();
  await a.page.getByRole('button', { name: 'Move module 2 up', exact: true }).click();
  await a.page.getByRole('button', { name: 'Page 3', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add <Sentence usage>', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add <Sentence usage>', exact: true }).click();
  assert.equal(await a.page.locator('.module-block').count(), 2);
  assert.equal(await a.page.locator('.module-library button').count(), 5);
  await a.page.getByLabel('Sample input', { exact: true }).selectOption('sentence');
  assert.match(await a.page.locator('.preview').nth(2).textContent(), /我真的很幸福/);
  assert.match(await a.page.locator('.preview').nth(3).textContent(), /Empty page/);
  assert.equal(application.store.cards().length, 0); assert.equal(application.store.account().decks.length, 1);
  await a.page.screenshot({ path: 'artifacts/m3-configuration.png', fullPage: true });
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor();
  const created = application.store.account().decks.find(deck => deck.name === 'Everyday Chinese');
  assert.equal(created.pages.length, 4);
  assert.deepEqual(created.pages[1].modules.map(module => module.type), ['german-explanation', 'german-examples']);
  await a.page.getByLabel('Options for Everyday Chinese').click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Set as default', exact: true }).click();
  assert.equal(application.store.snapshot().id, created.id);

  const session = { installationId: 'fixture', sessionId: 'fixture-browser', epoch: 1 };
  application.store.openSession('fixture-session', session);
  const cardId = application.store.capture('fixture-capture', { session, selectedText: '幸福', snapshot: application.store.snapshot() }).cardId;
  for (const page of application.store.card(cardId).pages) {
    application.store.stage(page.attempt_id, { ok: true, text: page.page_id === created.pages[1].id ? 'Saved manual content' : '' });
    application.store.publish(`fixture-${page.page_id}`, { attemptId: page.attempt_id, session });
  }
  await a.page.getByLabel('Options for Everyday Chinese').click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Configure deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await a.page.getByRole('button', { name: 'Remove this page', exact: true }).click();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(application.store.card(cardId).pages.length, 4);
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor();
  assert.equal(application.store.card(cardId).pages.length, 3);
  assert.equal(application.store.card(cardId).pages[1].page_id, created.pages[2].id);
  await a.page.getByLabel('Options for Everyday Chinese').click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor({ state: 'detached' });
  assert.equal(application.store.snapshot().name, 'My Deck');
  assert.equal(application.store.cards().length, 0);
});
