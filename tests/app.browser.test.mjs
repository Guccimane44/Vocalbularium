import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createApplication } from '../src/server/app.mjs';

async function launch(profile, extension = resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'extension')) {
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

test('free host: startup HTML is actionable and an erased account requires fresh sign-in', { timeout: 45000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-free-host-'));
  let application = createApplication();
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
  application.store.createDeck('Before reset');
  await browser.page.reload();
  await browser.page.getByRole('heading', { name: 'Before reset', exact: true }).waitFor();

  await application.close();
  application = createApplication();
  await application.start();
  await browser.page.reload();
  await browser.page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await signIn(browser.page);
  await browser.page.getByRole('heading', { name: 'My Deck', exact: true }).waitFor();
  assert.equal(await browser.page.getByRole('heading', { name: 'Before reset', exact: true }).count(), 0);
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
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByText('DEFAULT DECK', { exact: true }).waitFor();
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

test('manual card UI: multi-page drafts, leave choices, sorting, failed-save recovery, and deletion', { timeout: 45000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-manual-browser-'));
  const filename = join(directory, 'account.sqlite');
  let application = createApplication({ filename }); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  await a.page.getByRole('heading', { name: 'My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add card manually', exact: true }).click();
  await a.page.getByLabel('Page 1 content', { exact: true }).fill('zebra');
  await a.page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await a.page.getByLabel('Page 2 content', { exact: true }).fill('== literal note ==\n: second page');
  await a.page.getByRole('button', { name: 'Page 1', exact: true }).click();
  assert.equal(await a.page.getByLabel('Page 1 content', { exact: true }).inputValue(), 'zebra');
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Continue editing', exact: true }).click();
  assert.equal(await a.page.getByLabel('Page 1 content', { exact: true }).inputValue(), 'zebra');
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('button', { name: 'zebra', exact: true }).waitFor();
  const card = application.store.cards()[0]; assert.equal(card.status, null); assert.equal(card.pages[1].text, '== literal note ==\n: second page');
  await a.page.getByRole('button', { name: 'zebra', exact: true }).click();
  assert.equal(await a.page.getByRole('button', { name: 'Retry', exact: true }).count(), 0);
  await a.page.getByRole('button', { name: 'Edit card manually', exact: true }).click();
  await a.page.getByLabel('Page 1 content', { exact: true }).fill('discard this');
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
  assert.equal(application.store.card(card.id).pages[0].text, 'zebra');
  await a.page.getByRole('button', { name: 'zebra', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit card manually', exact: true }).click();
  await a.page.getByLabel('Page 1 content', { exact: true }).fill('cancel this');
  await a.page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await a.page.getByLabel('Page 2 content', { exact: true }).fill('cancel both');
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(application.store.card(card.id).pages[0].text, 'zebra');
  await a.page.getByRole('button', { name: 'Edit card manually', exact: true }).click();
  await a.page.getByLabel('Page 2 content', { exact: true }).fill('saved second page');
  await a.page.getByRole('button', { name: 'Page 1', exact: true }).click();
  await a.page.getByLabel('Page 1 content', { exact: true }).fill('alpha');
  await application.close();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  assert.equal(await a.page.getByLabel('Page 1 content', { exact: true }).inputValue(), 'alpha');
  application = createApplication({ filename }); await application.start();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit card manually', exact: true }).waitFor();
  assert.deepEqual(application.store.card(card.id).pages.map(page => page.text), ['alpha', 'saved second page']);
  assert.equal(application.store.card(card.id).created_at, card.created_at);
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add card manually', exact: true }).click();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit card manually', exact: true }).waitFor();
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByLabel('Sort cards', { exact: true }).selectOption('az');
  assert.deepEqual(await a.page.locator('table .entry').allTextContents(), ['Empty front page', 'alpha']);
  assert.deepEqual(await a.page.locator('table tr td:first-child').allTextContents(), ['001', '002']);
  await a.page.getByLabel('Sort cards', { exact: true }).selectOption('za');
  assert.deepEqual(await a.page.locator('table .entry').allTextContents(), ['alpha', 'Empty front page']);
  await a.page.getByRole('button', { name: 'alpha', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit card manually', exact: true }).click();
  await a.page.getByRole('button', { name: 'Delete card', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(application.store.cards().length, 2);
  await a.page.getByRole('button', { name: 'Delete card', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete card', exact: true }).click();
  await a.page.getByRole('button', { name: 'Empty front page', exact: true }).waitFor();
  assert.equal(application.store.cards().length, 1);
});

test('page retry UI: exact confirmation and two-installation lock preserve all drafts until explicit resubmission', { timeout: 35000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-retry-browser-'));
  let release;
  const application = createApplication({ provider: {
    interpret: async () => ({ inputType: 'word_phrase', sourceLanguage: 'Chinese' }),
    generate: (_, signal) => new Promise((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }); })
  } });
  await application.start();
  const session = { installationId: 'fixture', sessionId: 'fixture', epoch: 1 }; application.store.openSession('fixture', session);
  const { cardId } = application.store.capture('fixture-capture', { session, selectedText: '幸福', snapshot: application.store.snapshot() });
  application.store.establishInterpretation(cardId, { inputType: 'word_phrase', sourceLanguage: 'Chinese' });
  for (const page of application.store.card(cardId).pages) {
    application.store.stage(page.attempt_id, { ok: true, text: 'saved original' }); application.store.publish(page.page_id, { attemptId: page.attempt_id, session });
  }
  const a = await launch(join(directory, 'a')), b = await launch(join(directory, 'b'));
  t.after(async () => { await a.context.close(); await b.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page); await signIn(b.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#card/${cardId}`);
  await b.page.goto(`chrome-extension://${b.id}/app.html#card/${cardId}`);
  await b.page.getByRole('button', { name: 'Edit card manually', exact: true }).click();
  await b.page.getByLabel('Page 1 content', { exact: true }).fill('draft front');
  await b.page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await b.page.getByLabel('Page 2 content', { exact: true }).fill('draft back');
  await a.page.getByRole('button', { name: 'Page 2', exact: true }).click();
  await a.page.getByRole('button', { name: 'Retry', exact: true }).click();
  assert.equal(await a.page.getByRole('dialog').locator('p').textContent(), 'Retry will delete all content on this page, including manual edits and previous generated content, and generate it again. Other pages will not change.');
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(application.store.card(cardId).pages[1].text, 'saved original');
  await a.page.getByRole('button', { name: 'Retry', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await waitFor(() => release, 'retry provider started');
  await a.page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Retry', exact: true }).isDisabled(), true);
  await b.page.getByRole('button', { name: 'Save', exact: true }).click();
  await b.page.getByRole('alert').filter({ hasText: 'still generating' }).waitFor();
  assert.deepEqual(application.store.card(cardId).pages.map(page => page.text), ['saved original', '']);
  assert.equal(await b.page.getByLabel('Page 2 content', { exact: true }).inputValue(), 'draft back');
  release('regenerated page');
  await waitFor(() => application.store.card(cardId).pages[1].status === 'completed', 'retry saved');
  assert.deepEqual(application.store.card(cardId).pages.map(page => page.text), ['saved original', 'regenerated page']);
  await b.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await b.page.getByRole('button', { name: 'Edit card manually', exact: true }).waitFor();
  assert.deepEqual(application.store.card(cardId).pages.map(page => page.text), ['draft front', 'draft back']);
});

async function loseNextAcknowledgment(worker, path) {
  await worker.evaluate(path => {
    globalThis.originalTestFetch ??= globalThis.fetch;
    globalThis.dropTestPath = path;
    globalThis.fetch = async (url, ...options) => {
      const response = await globalThis.originalTestFetch(url, ...options);
      if (String(url).endsWith(globalThis.dropTestPath)) {
        globalThis.dropTestPath = undefined;
        return new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return response;
    };
  }, path);
}

test('assembled reliability: lost acknowledgments, worker suspension, abrupt origin exit, other installation, and cancellation', { timeout: 65000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-reliability-browser-'));
  const extension = join(directory, 'extension'); await cp(resolve('extension'), extension, { recursive: true });
  await appendFile(join(extension, 'background.js'), '\nglobalThis.captureForTest = handleCapture;\n');
  const held = new Map(), calls = new Map(), canceled = new Set();
  const application = createApplication({ provider: {
    interpret: async () => ({ inputType: 'word_phrase', sourceLanguage: 'Chinese' }),
    generate: ({ selectedText }, signal) => {
      calls.set(selectedText, (calls.get(selectedText) ?? 0) + 1);
      if (!selectedText.startsWith('hold-')) return Promise.resolve(`Generated: ${selectedText}`);
      return new Promise((resolve, reject) => {
        held.set(selectedText, () => resolve(`Generated: ${selectedText}`));
        signal.addEventListener('abort', () => { canceled.add(selectedText); reject(Error('aborted')); }, { once: true });
      });
    }
  } }); await application.start();
  const contexts = new Set();
  t.after(async () => { for (const context of contexts) await context.close().catch(() => {}); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const profile = join(directory, 'a');
  let a = await launch(profile, extension); contexts.add(a.context); await signIn(a.page);
  let reading = await a.context.newPage(); await reading.goto('http://127.0.0.1:4318/health');
  await loseNextAcknowledgment(a.worker, '/api/capture');
  await captureFrom(a, 'uncertain capture');
  const card = application.store.cards().find(card => card.selected_text === 'uncertain capture');
  const attempts = card.pages.map(page => page.attempt_id);
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await waitFor(() => application.store.card(card.id).status === 'completed', 'uncertain capture recovered');
  assert.equal(application.store.cards().length, 1); assert.equal(calls.get('uncertain capture'), 1);
  assert.deepEqual(application.store.card(card.id).pages.map(page => page.attempt_id), attempts);

  await a.page.goto(`chrome-extension://${a.id}/app.html#card/${card.id}`);
  await a.page.getByRole('button', { name: 'Edit card manually', exact: true }).click();
  await a.page.getByLabel('Page 1 content', { exact: true }).fill('save with lost acknowledgment');
  await loseNextAcknowledgment(a.worker, '/api/card/save');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  application.store.savePages('later-remote-edit', { cardId: card.id, changes: [{ pageId: card.pages[0].page_id, text: 'later remote edit' }] });
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit card manually', exact: true }).waitFor();
  assert.equal(application.store.card(card.id).pages[0].text, 'later remote edit');
  assert.equal(calls.get('uncertain capture'), 1);

  await loseNextAcknowledgment(a.worker, '/api/publish');
  await captureFrom(a, 'publication acknowledgment');
  let pending;
  await waitFor(async () => {
    pending = await a.worker.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).find(([key]) => key.startsWith('save-publish-'))?.[1]);
    return pending;
  }, 'publication acknowledgment was lost');
  const publishedAttempt = application.store.attempt(pending.payload.payload.attemptId);
  application.store.savePages('later-than-publication', { cardId: publishedAttempt.card_id, changes: [{ pageId: publishedAttempt.page_id, text: 'manual text after publication' }] });
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await waitFor(async () => !(await a.worker.evaluate(async id => (await chrome.storage.local.get(`save-${id}`))[`save-${id}`], pending.operationId)), 'publication receipt recovered');
  assert.equal(application.store.card(publishedAttempt.card_id).pages.find(page => page.page_id === publishedAttempt.page_id).text, 'manual text after publication');

  await captureFrom(a, 'hold-worker');
  await waitFor(() => held.has('hold-worker'), 'worker test generation started');
  const oldSession = await a.worker.evaluate(async () => (await chrome.storage.session.get('session')).session);
  await a.worker.evaluate(() => { globalThis.workerProbe = 'old'; });
  const internals = await a.context.newPage(); await internals.goto('chrome://serviceworker-internals');
  const registration = internals.locator('.serviceworker-registration').filter({ hasText: a.worker.url() });
  await registration.getByRole('button', { name: 'Stop', exact: true }).click();
  await waitFor(async () => (await registration.locator('.serviceworker-running-status .value').textContent()) === 'STOPPED', 'product worker stopped');
  held.get('hold-worker')();
  await a.page.reload();
  await a.page.getByRole('button', { name: 'Edit card manually', exact: true }).waitFor();
  a.worker = a.context.serviceWorkers().find(worker => worker.url().includes(a.id));
  assert.equal(await a.worker.evaluate(() => globalThis.workerProbe), undefined);
  assert.deepEqual(await a.worker.evaluate(async () => (await chrome.storage.session.get('session')).session), oldSession);
  await waitFor(() => application.store.cards().find(card => card.selected_text === 'hold-worker')?.status === 'completed', 'worker suspension did not interrupt generation');
  await internals.close();

  const b = await launch(join(directory, 'b'), extension); contexts.add(b.context); await signIn(b.page);
  const otherReading = await b.context.newPage(); await otherReading.goto('http://127.0.0.1:4318/health');
  await captureFrom(a, 'hold-origin'); await captureFrom(b, 'hold-other');
  const interrupted = application.store.cards().find(card => card.selected_text === 'hold-origin');
  await waitFor(() => application.store.card(interrupted.id).pages[0].status === 'completed', 'front persisted before crash');
  const browser = a.context.browser(), protocol = await browser.newBrowserCDPSession();
  const { processInfo } = await protocol.send('SystemInfo.getProcessInfo'); const processId = processInfo.find(process => process.type === 'browser')?.id;
  assert.ok(processId); await protocol.detach();
  const disconnected = once(browser, 'disconnected'); process.kill(processId, 'SIGKILL'); await disconnected;
  contexts.delete(a.context);
  held.get('hold-origin')(); held.get('hold-other')();
  await waitFor(() => application.store.attempt(interrupted.pages[1].attempt_id).result, 'origin result staged after crash');
  await waitFor(() => application.store.cards().find(card => card.selected_text === 'hold-other')?.status === 'completed', 'other installation completed');
  a = await launch(profile, extension); contexts.add(a.context);
  await a.page.getByRole('heading', { name: 'A growing collection.' }).waitFor();
  assert.deepEqual(application.store.card(interrupted.id).pages.map(page => page.status), ['completed', 'failed']);
  assert.throws(() => application.store.publish('stale-origin', { attemptId: interrupted.pages[1].attempt_id, session: oldSession }), { code: 'stale_session' });

  await captureFrom(b, 'hold-delete'); await waitFor(() => held.has('hold-delete'), 'deletion test generation started');
  const deleted = application.store.cards().find(card => card.selected_text === 'hold-delete');
  const auth = await b.worker.evaluate(async () => (await chrome.storage.local.get('auth')).auth);
  const response = await fetch('http://127.0.0.1:4318/api/card/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ operationId: 'delete-running', payload: { cardId: deleted.id } }) });
  assert.equal(response.status, 200); await waitFor(() => canceled.has('hold-delete'), 'deleted card canceled model work');
  assert.throws(() => application.store.card(deleted.id), { code: 'deleted' });
  const shared = application.store.createDeck('Fresh shared default');
  application.store.setDefault('remote-default-before-capture', shared.id);
  await captureFrom(b, 'fresh shared destination');
  assert.equal(application.store.cards().find(card => card.selected_text === 'fresh shared destination').deck_id, shared.id);
});
