import test, { createTestApplication } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { blockText } from '@vocabularium/domain/pages';
import { isContentType } from '@vocabularium/domain/page-modules';
import { textBlocks, useModules } from './helpers/pages.mjs';
const text = component => blockText(component.content);
const keyOf = page => text(page.components.find(component => component.moduleType === 'main-key'));
const modulesOf = page => page.components.filter(component => isContentType(component.moduleType));
const byKey = async (store, key) => (await store.pages()).find(page => keyOf(page) === key);
const componentArticle = (page, heading) => page.locator('article.component').filter({ has: page.getByRole('heading', { name: heading, exact: true }) });
// A card's label in its tab drags the card; clicked, it ejects the card's actions (D07).
const cardTab = (page, heading) => componentArticle(page, heading).locator('.tab-button');
// An action ejected from its card's tab, opening the tab first when the actions are not out.
async function cardButton(page, name) {
  const button = page.getByRole('button', { name, exact: true });
  if (await button.count()) return button;
  await cardTab(page, name.replace(/^(Edit|Retry|Generate|Fold|Unfold|Delete) /, '')).click();
  return button;
}
const apiOrigin = process.env.VOCABULARIUM_API_URL ?? 'http://127.0.0.1:4318';

async function launch(profile, extension = resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension')) {
  const config = await readFile(join(extension, 'config.js'), 'utf8');
  assert.equal(JSON.parse(config.match(/^export const API_URL = (.+);/m)[1]), apiOrigin, 'Refuse a package pointed at a different API from the disposable fixture');
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
// The account menu holds appearance, diagnostic logs and log out once signed in (D05).
async function accountMenu(page) {
  const trigger = page.getByRole('button', { name: 'Account', exact: true });
  // From the keyboard: the capture popup can sit over the trigger in the top-right corner.
  if (await trigger.count() && await trigger.getAttribute('aria-expanded') !== 'true') await trigger.press('Enter');
}
async function chooseAppearance(page, value) {
  await accountMenu(page);
  await page.getByLabel('Appearance', { exact: true }).selectOption(value);
}
async function signIn(page) {
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
}

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

async function waitFor(predicate, message, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${message}`);
}
// Reports the step in progress, and the slowest finished ones, when a long
// browser journey fails or times out without naming where it stopped.
function steps(t) {
  const finished = [];
  let current = { name: 'setup', started: Date.now() }, done = false;
  t.after(() => {
    if (done) return;
    const slowest = finished.toSorted((a, b) => b[1] - a[1]).slice(0, 3).map(([name, ms]) => `${name} ${ms} ms`).join(', ');
    t.diagnostic(`stopped during "${current.name}" after ${Date.now() - current.started} ms; slowest earlier steps: ${slowest || 'none'}`);
  });
  const step = name => {
    const now = Date.now();
    finished.push([current.name, now - current.started]);
    current = { name, started: now };
  };
  step.done = () => { done = true; };
  return step;
}
async function captureFrom(browser, text) {
  return browser.worker.evaluate(async ({ text, origin }) => {
    const tabs = await chrome.tabs.query({ url: origin + '/health' });
    return globalThis.captureForTest({ menuItemId: 'capture', selectionText: text }, tabs[0]);
  }, { text, origin: apiOrigin });
}

test('capture extension: receipt lifetime, exact duplicate pages, shared outcomes, interruption, and unsaved capture recovery', { timeout: 65000 }, async (t) => {
  const step = steps(t);
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-capture-browser-'));
  const databaseKey = join(directory, 'account-fixture');
  const testingExtension = join(directory, 'extension');
  await cp(resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension'), testingExtension, { recursive: true });
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
  let application = await createTestApplication(t, { databaseKey, provider });
  await useModules(application.store, ['sentence-usage', 'german-examples']);
  await application.start();
  const contexts = new Set();
  t.after(async () => {
    for (const context of contexts) await context.close().catch(() => { });
    await application.close(); await rm(directory, { recursive: true, force: true });
  });
  const profile = join(directory, 'a');
  step('launch and sign in two installations');
  let a = await launch(profile, testingExtension); contexts.add(a.context); await signIn(a.page);
  const b = await launch(join(directory, 'b'), testingExtension); contexts.add(b.context); await signIn(b.page);
  let reading = await a.context.newPage(); await reading.goto(apiOrigin + '/health');
  await reading.setContent('<p id="selection">  幸福\n</p>');
  const selected = await reading.locator('#selection').evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node); getSelection().removeAllRanges(); getSelection().addRange(range); return getSelection().toString();
  });
  step('duplicate captures and their feedback');
  // Each capture shows feedback on receipt and then saves, so wait for both
  // popups rather than for two complete captures.
  const duplicates = [captureFrom(a, selected), captureFrom(a, selected)];
  await waitFor(async () => await reading.getByRole('status').count() === 2, 'each capture shows its own feedback', 3000);
  await reading.getByRole('button', { name: 'Close capture feedback' }).first().click();
  assert.equal(await reading.getByRole('status').count(), 1);
  await reading.getByRole('status').waitFor({ state: 'detached', timeout: 4500 });
  await Promise.all(duplicates);
  step('duplicate pages complete and synchronize');
  await waitFor(async () => (await application.store.pages()).filter(page => page.status === 'completed').length === 2, 'duplicate word pages completed');
  assert.equal((await application.store.pages())[0].selectedText, selected);
  assert.equal(keyOf((await application.store.pages())[0]), selected);
  await b.page.reload();
  await waitFor(async () => await b.page.locator('.capture-link').count() === 2, 'second installation synchronized duplicate captures');
  assert.equal(await b.page.locator('.capture-link').count(), 2);
  await b.page.locator('.capture-link').first().click();
  // Generated content is rendered by its module's render contract (D05): numbered
  // meanings and an example beside its translation, the main key emphasised.
  const generatedCard = componentArticle(b.page, 'German explanation + examples');
  await generatedCard.locator('.meanings li').filter({ hasText: 'Glück' }).waitFor();
  assert.equal(await generatedCard.locator('.example-translation').textContent(), 'Sie ist glücklich.');
  assert.equal(await generatedCard.locator('.example-sentence mark').textContent(), '幸福');
  assert.equal(await generatedCard.getByText('===', { exact: false }).count(), 0, 'no literal markup');
  assert.equal(await generatedCard.locator('.badge, .list-status').count(), 0, 'a completed card shows no status');

  step('sentence and failed interpretation');
  await captureFrom(a, '我真的很幸福'); await captureFrom(a, 'fail');
  await waitFor(async () => (await application.store.pages()).find(page => page.selectedText === 'fail')?.status === 'failed', 'failed interpretation persisted');
  const sentencePage = (await application.store.pages()).find(page => page.selectedText === '我真的很幸福');
  // The sentence example applies to a sentence; the word explanation completes empty.
  assert.deepEqual(modulesOf(sentencePage).map(item => [Boolean(text(item)), item.status]), [[true, 'completed'], [false, 'completed']]);
  assert.equal(sentencePage.status, 'completed');

  step('dashboard closure during generation');
  await captureFrom(a, 'held-after-close');
  await waitFor(() => held.has('held-after-close'), 'dashboard-close interpretation started');
  await a.page.close();
  held.get('held-after-close')();
  await waitFor(async () => (await application.store.pages()).find(page => page.selectedText === 'held-after-close')?.status === 'completed', 'dashboard closure leaves generation running');

  step('browser exit during generation');
  await captureFrom(a, 'held-interrupted');
  const interrupted = (await application.store.pages()).find(page => page.selectedText === 'held-interrupted');
  await waitFor(() => held.has('held-interrupted'), 'interrupted interpretation started');
  await a.context.close(); contexts.delete(a.context);
  held.get('held-interrupted')();
  await waitFor(async () => (await application.store.attempt(modulesOf(interrupted)[1].attemptId)).result, 'late provider result staged');
  step('relaunch after browser exit');
  a = await launch(profile, testingExtension); contexts.add(a.context);
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  // Both components waited on the held interpretation, so neither was published before exit.
  assert.deepEqual(modulesOf(await application.store.page(interrupted.id)).map(item => item.status), ['failed', 'failed']);

  step('open a reading tab before stopping the server');
  reading = await a.context.newPage(); await reading.goto(apiOrigin + '/health');
  step('stop the server');
  await application.close();
  step('capture while the server is stopped');
  const pendingId = await captureFrom(a, 'not saved yet');
  step('reload the dashboard while the server is stopped');
  await a.page.reload();
  step('read the pending capture receipt');
  // Cached account views remain accessible when the refresh fails.
  const receipt = await a.worker.evaluate(async (id) => (await chrome.storage.local.get(`capture-${id}`))[`capture-${id}`], pendingId);
  assert.equal(receipt.state, 'pending');
  step('explicit unsaved capture recovery');
  application = (await createTestApplication(t, { databaseKey, provider })); await application.start();
  await a.page.reload();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await waitFor(async () => (await application.store.pages()).find(page => page.selectedText === 'not saved yet')?.status === 'completed', 'explicit unsaved capture recovery');
  assert.equal((await application.store.pages()).filter(page => page.selectedText === 'not saved yet').length, 1);
  step.done();
});

test('capture with Context: the surrounding block follows the deck’s Context module, capped, into the page and generation', { timeout: 40000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-capture-context-'));
  const testingExtension = join(directory, 'extension');
  await cp(resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension'), testingExtension, { recursive: true });
  await appendFile(join(testingExtension, 'background.js'), '\nglobalThis.captureForTest = handleCapture;\n');
  const interpreted = [];
  const provider = {
    async interpret(text, signal, sessionId, context) { interpreted.push({ text, context }); return { inputType: 'word_phrase', sourceLanguage: 'Chinese' }; },
    async generate() { return 'Glück'; }
  };
  const application = await createTestApplication(t, { provider });
  await useModules(application.store, ['context', 'german-examples']);
  await application.start();
  const a = await launch(join(directory, 'a'), testingExtension);
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  const reading = await a.context.newPage(); await reading.goto(apiOrigin + '/health');
  const filler = 'Ein langer Satz ohne Bedeutung. '.repeat(20);
  await reading.setContent(`<main><p>Nicht dieser Absatz.</p><p id="block">${filler}Sie war <b id="word">幸福</b> und  lachte.\n${filler}</p></main>`);
  const select = selector => reading.locator(selector).evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node); getSelection().removeAllRanges(); getSelection().addRange(range); return getSelection().toString();
  });
  // A Context module with nothing captured leaves an empty Context component.
  const contextOf = page => page.components.filter(component => component.moduleType === 'context').map(text).filter(Boolean);

  // On by default: the block around the selection, capped near 500 characters, with whitespace collapsed.
  await captureFrom(a, await select('#word'));
  await waitFor(async () => (await application.store.pages())[0]?.status === 'completed', 'capture with Context completed');
  const [context] = contextOf((await application.store.pages())[0]);
  assert.ok(context, 'the captured page has Context');
  assert.match(context, /Sie war 幸福 und lachte\. Ein langer/);
  assert.ok(context.startsWith('…') && context.endsWith('…') && context.length <= 502, `capped Context: ${context.length}`);
  assert.ok(!context.includes('Nicht dieser Absatz'), 'only the selection’s own block');
  assert.deepEqual(interpreted.at(-1), { text: '幸福', context });
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${(await application.store.pages())[0].id}`);
  await componentArticle(a.page, 'Context').locator('pre').filter({ hasText: 'Sie war 幸福 und lachte.' }).waitFor();

  // A selection filling its whole block has no surrounding text and so no Context.
  await captureFrom(a, await select('main > p:first-child'));
  await waitFor(async () => (await application.store.pages()).length === 2, 'whole-block capture saved');
  assert.deepEqual(contextOf(await byKey(application.store, 'Nicht dieser Absatz.')), []);

  // The Context module removed from the deck: nothing beyond the selection is taken.
  const deckId = (await application.store.account()).defaultDeckId;
  const hasContext = deck => deck?.modules.some(module => module.type === 'context');
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  await a.page.getByRole('button', { name: 'Remove Context', exact: true }).click();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(async () => !hasContext(await application.store.deck(deckId)), 'deck without the Context module saved');
  await waitFor(async () => !hasContext((await a.worker.evaluate(async () => (await chrome.storage.local.get('account')).account))
    ?.defaultDeckSnapshot), 'extension sees the deck without the Context module');
  await captureFrom(a, await select('#word'));
  await waitFor(async () => (await application.store.pages()).length === 3 && interpreted.length === 3, 'capture without Context generated');
  const plain = (await application.store.pages()).filter(page => keyOf(page) === '幸福').find(page => !contextOf(page).length);
  assert.ok(plain, 'the page captured without the Context module has no Context');
  assert.ok(!plain.components.some(component => component.moduleType === 'context'));
  assert.deepEqual(interpreted.at(-1), { text: '幸福', context: undefined });
  const receipts = await a.worker.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).filter(([key]) => key.startsWith('capture-')).map(([, item]) => item.payload));
  assert.ok(receipts.every(payload => payload.mainKey !== '幸福' || payload.context === undefined || payload.context === context));
});

test('capture motion: the selection flies into the popup, reduced motion skips it, and the toolbar badge counts until the dashboard opens', { timeout: 40000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-capture-motion-'));
  const testingExtension = join(directory, 'extension');
  await cp(resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension'), testingExtension, { recursive: true });
  await appendFile(join(testingExtension, 'background.js'), '\nglobalThis.captureForTest = handleCapture;\n');
  const application = await createTestApplication(t, { provider: {
    async interpret() { return { inputType: 'word_phrase', sourceLanguage: 'German' }; },
    async generate() { return 'Glück'; }
  } });
  await application.start();
  const a = await launch(join(directory, 'a'), testingExtension);
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  const deckId = (await application.store.snapshot()).id;
  // Away from the dashboard, captures accumulate on the toolbar badge.
  await a.page.goto(`chrome-extension://${a.id}/app.html#deck/${deckId}`);
  const badge = () => a.worker.evaluate(() => chrome.action.getBadgeText({}));
  assert.equal(await badge(), '');
  const reading = await a.context.newPage(); await reading.goto(apiOrigin + '/health');
  const long = 'Fernweh ist die Sehnsucht nach fernen Orten und unbekannten Ländern';
  await reading.setContent(`<p style="margin-top:300px">Ein Wort: <b id="word">${long}</b>.</p>`);
  const select = () => reading.locator('#word').evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node); getSelection().removeAllRanges(); getSelection().addRange(range); return getSelection().toString();
  });
  const label = reading.locator('vocabularium-feedback .flight-label');
  const status = reading.getByRole('status');

  const flying = captureFrom(a, await select());
  await label.waitFor({ state: 'attached', timeout: 3000 });
  assert.equal(await label.textContent(), long.slice(0, 43) + '…', 'a long label is shortened; the capture keeps the full text');
  await status.waitFor();
  await label.waitFor({ state: 'detached' });
  await flying;
  assert.equal(keyOf((await application.store.pages())[0]), long);
  await waitFor(async () => await badge() === '1', 'the badge counts the accepted capture');
  await status.waitFor({ state: 'detached', timeout: 5000 });

  // Reduced motion: no flight, the popup at once, and the capture unchanged.
  await reading.emulateMedia({ reducedMotion: 'reduce' });
  const started = Date.now();
  const still = captureFrom(a, await select());
  await status.waitFor();
  assert.equal(await label.count(), 0, 'nothing flies under reduced motion');
  assert.ok(Date.now() - started < 2000);
  await still;
  await waitFor(async () => await badge() === '2', 'the badge counts every capture');

  // Opening the dashboard clears the badge.
  await a.page.bringToFront();
  await a.page.goto(`chrome-extension://${a.id}/app.html#`);
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  await waitFor(async () => await badge() === '', 'the dashboard clears the badge');
  assert.equal((await a.worker.evaluate(() => chrome.storage.local.get('captureBadge'))).captureBadge, 0);
});

test('recent captures: the pending receipt hands off to its account page without an empty or duplicate frame', { timeout: 35000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-capture-handoff-'));
  const testingExtension = join(directory, 'extension');
  await cp(resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension'), testingExtension, { recursive: true });
  await appendFile(join(testingExtension, 'background.js'), '\nglobalThis.captureForTest = handleCapture;\n');
  let releaseGeneration, holdAccounts = false;
  const heldAccounts = [];
  const application = await createTestApplication(t, {
    provider: {
      async interpret() {
        await new Promise(resolve => { releaseGeneration = resolve; });
        return { inputType: 'word_phrase', sourceLanguage: 'English' };
      },
      async generate() { return 'Controlled explanation'; }
    }
  });
  const handler = application.server.listeners('request')[0];
  application.server.removeListener('request', handler);
  application.server.on('request', async (request, response) => {
    if (holdAccounts && request.url === '/api/account/summary' && (await application.store.pages()).length) {
      heldAccounts.push(() => handler(request, response)); return;
    }
    handler(request, response);
  });
  await application.start();
  const a = await launch(join(directory, 'profile'), testingExtension);
  t.after(async () => {
    holdAccounts = false; for (const resume of heldAccounts.splice(0)) resume(); releaseGeneration?.();
    await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true });
  });
  await signIn(a.page);
  const reading = await a.context.newPage(); await reading.goto(apiOrigin + '/health');
  await a.page.evaluate(() => {
    const sample = () => {
      const count = [...document.querySelectorAll('.capture-text')].filter(node => node.textContent === 'handoff').length;
      if (count) state.seen = true;
      if (state.seen && count !== 1) state.invalidCounts.push(count);
    };
    const state = { seen: false, invalidCounts: [] }; window.handoffObservation = state;
    const observer = new MutationObserver(sample);
    observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
    window.stopHandoffObservation = () => observer.disconnect();
  });
  holdAccounts = true;
  const capture = captureFrom(a, 'handoff');
  await waitFor(() => a.page.evaluate(() => window.handoffObservation.seen), 'local receipt appeared');
  await waitFor(() => heldAccounts.length, 'post-capture account refresh held');
  // Let storage events and a paint complete while the account response is held.
  await a.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const row = a.page.locator('.capture').filter({ has: a.page.getByText('handoff', { exact: true }) });
  assert.equal(await row.count(), 1, 'receipt remains visible until its account page is ready');
  assert.equal(await row.getAttribute('data-state'), 'saving');
  holdAccounts = false; for (const resume of heldAccounts.splice(0)) resume();
  await capture;
  await row.getByRole('link').waitFor();
  assert.equal(await row.getAttribute('data-state'), 'loading', 'saved page still shows generation pending');
  assert.deepEqual(await a.page.evaluate(() => window.handoffObservation.invalidCounts), [], 'no disappearance or duplicate row during handoff');
  await a.page.evaluate(() => window.stopHandoffObservation());
  releaseGeneration();
  await waitFor(async () => (await application.store.pages())[0]?.status === 'completed', 'generation completed normally');
  assert.equal((await application.store.pages()).length, 1);
});

test('deck UI: draft previews, all modules, the module limit, removal without content loss, and default deletion', { timeout: 40000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-decks-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  await a.page.getByRole('button', { name: 'Add new deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).fill('Discard this draft');
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await application.store.account()).decks.length, 1);

  await a.page.getByRole('button', { name: 'Add new deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).fill('Everyday Chinese');
  // A new deck has a colour, one of the six, which the user can change (D06).
  assert.equal(await a.page.getByRole('group', { name: 'Deck colour' }).getByRole('radio').count(), 6);
  assert.equal(await a.page.getByRole('group', { name: 'Deck colour' }).getByRole('radio', { checked: true }).count(), 1);
  await a.page.getByRole('radio', { name: 'Rose', exact: true }).check();
  assert.equal(await a.page.locator('.module-block').count(), 3, 'a new deck starts with the main key, Context and the German explanation');
  // The main key looks like the other modules, with no lock mark (0.6.3), drag label, menu or Remove.
  const mainKeyBlock = a.page.locator('.module-block[data-type="main-key"]');
  assert.equal(await mainKeyBlock.innerText(), 'Main key');
  assert.equal(await mainKeyBlock.getByRole('img').count(), 0, 'no lock mark');
  assert.equal(await mainKeyBlock.locator('.block-label, button').count(), 0, 'no drag label, menu or Remove on the main key');
  await addFromWindow(a.page, 'sentence-usage');
  const usage = a.page.locator('.sortable-row').filter({ has: a.page.locator('.module-block[data-type="sentence-usage"]') });
  await usage.waitFor();
  // Dropped on the upper half of Sentence usage, German explanation lands before it.
  await addFromWindow(a.page, 'german-explanation', usage, { above: true });
  await addFromWindow(a.page, 'sentence-usage');
  await addFromWindow(a.page, 'sentence-usage');
  assert.equal(await a.page.locator('.module-block').count(), 7);
  assert.equal(await a.page.locator('.module-window .window-module').count(), 5, 'the window offers Context, Text and the three content modules');
  assert.equal(await a.page.locator('.module-window button:not(.help-button)').count(), 0, 'no Add buttons (D04)');
  assert.equal(await a.page.locator('.window-module[data-type="context"]').getAttribute('aria-disabled'), 'true', 'one Context per deck');
  await a.page.getByText('There is already a Context.').waitFor();
  // The preview opens in a dialog from the button above the list, so deck settings keep the list-and-window layout (0.6.3).
  assert.equal(await a.page.locator('.sample-page').count(), 0, 'no preview beside the list');
  await a.page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = a.page.getByRole('dialog', { name: 'Preview' });
  await preview.waitFor();
  await preview.getByLabel('Sample input', { exact: true }).selectOption('sentence');
  assert.equal(await preview.locator('.preview').count(), 7, 'one preview per module, the main key included');
  assert.match(await preview.locator('.preview').nth(0).textContent(), /我真的很幸福/);
  // A module that does not apply to the sample input is only its tab, as an empty component on a page (0.6.2).
  assert.equal(await preview.locator('.preview').nth(2).textContent(), 'German explanation + examples');
  assert.equal(await preview.locator('.preview').nth(2).getAttribute('data-empty'), 'true');
  assert.match(await preview.locator('.preview').nth(4).textContent(), /我真的很幸福/);
  const previewTypes = () => preview.locator('.sample-page .component').evaluateAll(nodes => nodes.map(node => node.dataset.type));
  const listTypes = () => a.page.locator('.shaping-list .module-block').evaluateAll(nodes => nodes.slice(1).map(node => node.dataset.type));
  assert.deepEqual(await previewTypes(), await listTypes(), 'the preview follows the list');
  await preview.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  await a.page.screenshot({ path: 'artifacts/m3-configuration-preview.png' });
  await a.page.keyboard.press('Escape');
  await preview.waitFor({ state: 'detached' });
  assert.equal(await a.page.evaluate(() => document.activeElement.textContent), 'Preview', 'closing returns to the Preview button');
  await a.page.getByRole('button', { name: 'Preview', exact: true }).click();
  await preview.locator('.preview-dialog, .sample-page').first().waitFor();
  await a.page.mouse.click(5, 5);
  await preview.waitFor({ state: 'detached' });
  // A module is two parts edge to edge: the six dots at its left end, then its icon and name.
  const block = a.page.locator('.module-block[data-type="german-explanation"]');
  await block.scrollIntoViewIfNeeded();
  assert.deepEqual(await block.evaluate(node => {
    const box = node.getBoundingClientRect();
    return [5, box.width / 3].map(x => document.elementFromPoint(box.left + x, box.top + box.height / 2)?.closest('.menu-button, .block-label')?.className);
  }), ['menu-button', 'block-label']);
  // A module drags by its label (D07).
  await block.locator('.block-label').focus();
  await a.page.keyboard.press('Space');
  await new Promise(resolve => setTimeout(resolve, 300));
  await a.page.keyboard.press('ArrowUp');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await a.page.locator('.module-block').nth(2).getAttribute('data-type'), 'german-examples', 'nothing dropped yet');
  // The others slide to make room.
  const slides = await a.page.locator('.shaping-list .sortable-row').evaluateAll(rows => rows.filter(row => !row.hasAttribute('data-dragging'))
    .map(row => getComputedStyle(row).transitionDuration));
  assert.ok(slides.length && slides.every(duration => parseFloat(duration) >= 0.2), `rows make room with a transition (${slides})`);
  await a.page.keyboard.press('Escape');
  assert.deepEqual(await listTypes(), ['context', 'german-examples', 'german-explanation', 'sentence-usage', 'sentence-usage', 'sentence-usage'], 'a cancelled drag keeps the order');
  assert.equal((await application.store.pages()).length, 0); assert.equal((await application.store.account()).decks.length, 1);
  await a.page.screenshot({ path: 'artifacts/m3-configuration.png', fullPage: true });
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor();
  const created = (await application.store.account()).decks.find(deck => deck.name === 'Everyday Chinese');
  assert.deepEqual(created.modules.map(module => module.type),
    ['main-key', 'context', 'german-examples', 'german-explanation', 'sentence-usage', 'sentence-usage', 'sentence-usage']);
  assert.equal(created.colour, 'sound');
  await a.page.locator('.nav-item.fam-sound').filter({ hasText: 'Everyday Chinese' }).waitFor();
  await a.page.locator('article.deck.fam-sound').filter({ hasText: 'Everyday Chinese' }).waitFor();
  await a.page.getByLabel('Options for Everyday Chinese').click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Set as default', exact: true }).click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByText('Default', { exact: true }).waitFor();
  assert.equal((await application.store.snapshot()).id, created.id);

  const session = { installationId: 'fixture', sessionId: 'fixture-browser', epoch: 1 };
  await application.store.openSession('fixture-session', session);
  const pageId = (await application.store.capture('fixture-capture', { session, mainKey: '幸福', snapshot: (await application.store.snapshot()) })).pageId;
  for (const item of modulesOf(await application.store.page(pageId))) {
    await application.store.stage(item.attemptId, { ok: true, text: item.moduleType === 'german-examples' ? 'Saved explanation' : '' });
    await application.store.publish(`fixture-${item.id}`, { attemptId: item.attemptId, session });
  }
  const before = (await application.store.page(pageId)).components.map(item => [item.moduleType, text(item)]);
  await a.page.getByLabel('Options for Everyday Chinese').click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Configure deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Remove German explanation + examples', exact: true }).click();
  for (let count = 6; count < 12; count++) await addFromWindow(a.page, 'sentence-usage');
  assert.equal(await a.page.locator('.module-block').count(), 12);
  assert.equal(await a.page.locator('.window-module[aria-disabled="false"]').count(), 0, 'the window is closed at twelve modules');
  await a.page.getByText('At most 12 modules, including the main key.').first().waitFor();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor();
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'changing the deck needs no content-loss confirmation');
  assert.deepEqual((await application.store.page(pageId)).components.map(item => [item.moduleType, text(item)]), before, 'deck changes never reach an existing page');
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await componentArticle(a.page, 'German explanation + examples').getByText('Saved explanation').waitFor();
  await a.page.goto(`chrome-extension://${a.id}/app.html`);
  await a.page.getByLabel('Options for Everyday Chinese').click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor({ state: 'detached' });
  assert.equal((await application.store.snapshot()).id, (await application.store.account()).decks.find(deck => deck.name === 'My Deck').id);
  assert.equal((await application.store.pages()).length, 0);
});

test('deck menus: page-list actions, Escape, cancellation, replacement and sole-deck reset', { timeout: 40000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-menu-browser-'));
  const databaseKey = join(directory, 'account-fixture');
  let application = await createTestApplication(t, { databaseKey }); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  assert.equal(await a.page.getByText('YOUR VOCABULARY', { exact: true }).count(), 0);
  assert.equal(await a.page.getByText('YOUR WORDS, KEPT CLOSE.', { exact: true }).count(), 0);
  const second = await application.store.createDeck('Second deck');
  await a.page.reload();
  await a.page.getByRole('heading', { name: 'Second deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).waitFor();
  const trigger = a.page.getByLabel('Options for Second deck', { exact: true });
  await trigger.focus(); await a.page.keyboard.press('Enter');
  await a.page.getByRole('button', { name: 'Set as default', exact: true }).waitFor();
  await a.page.keyboard.press('Escape');
  assert.equal(await a.page.locator('.deck-menu[open]').count(), 0);
  assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  await trigger.click();
  await a.page.getByRole('button', { name: 'Configure deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).waitFor();
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Second deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).waitFor();
  await application.close();
  await trigger.click();
  await a.page.getByRole('button', { name: 'Set as default', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  assert.equal(await a.page.locator('.deck-menu[open]').count(), 0);
  application = (await createTestApplication(t, { databaseKey })); await application.start();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await waitFor(async () => (await application.store.account()).defaultDeckId === second.id, 'page-list default saved');
  await waitFor(() => a.page.getByRole('button', { name: 'Set as default', exact: true, includeHidden: true }).isDisabled(), 'current default disabled');
  await trigger.click();
  await a.page.getByRole('button', { name: 'Delete deck', exact: true }).click();
  assert.equal(await a.page.locator('.deck-menu[open]').count(), 0);
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.match(a.page.url(), /#deck\//);
  assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  await trigger.click();
  await a.page.getByRole('button', { name: 'Delete deck', exact: true }).click();
  assert.equal(await a.page.getByRole('dialog').getByLabel('New default deck').inputValue(), (await application.store.account()).decks.find(deck => deck.id !== second.id).id);
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.equal((await application.store.account()).decks.length, 1);
  await a.page.getByRole('heading', { name: 'My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).waitFor();
  const original = (await application.store.snapshot()).id;
  await a.page.getByLabel('Options for My Deck').click();
  await a.page.getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('dialog').getByText(/A new empty My Deck will replace it/).waitFor();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.notEqual((await application.store.snapshot()).id, original);
  assert.equal((await application.store.account()).decks.length, 1);
});

test('default-deck deletion can choose a replacement beyond the first deck page', { timeout: 35000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-deck-pages-'));
  const application = await createTestApplication(t); await application.start();
  let last;
  for (let index = 0; index < 45; index++) last = await application.store.createDeck(`Deck ${index}`);
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  await a.page.getByLabel('Options for My Deck').click();
  await a.page.getByRole('button', { name: 'Delete deck', exact: true }).click();
  const modal = a.page.getByRole('dialog');
  assert.equal(await modal.getByLabel('New default deck').locator('option').count(), 39);
  await modal.getByRole('button', { name: 'Load more decks' }).click();
  await modal.getByLabel('New default deck').selectOption({ label: 'Deck 44' });
  await modal.getByRole('button', { name: 'Delete deck', exact: true }).click();
  await waitFor(async () => (await application.store.account()).defaultDeckId === last.id, 'later-page replacement saved');
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
  await addFromWindow(a.page, 'sentence-usage');
  for (const appearance of ['dark', 'light']) {
    await theme(a.page, appearance);
    assert.equal(await a.page.getByLabel('Deck name', { exact: true }).inputValue(), 'Unsaved configuration');
    assert.equal(await a.page.locator('.module-block').count(), 4);
    await a.page.screenshot({ path: `artifacts/v0.2.0-configuration-${appearance}.png`, fullPage: true });
  }
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('page list: quiet states, layouts remembered per deck, sorting, grouping, every pointer target, text selection and keyboard navigation', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-rows-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['sentence-usage', 'german-examples']);
  const deck = await store.snapshot();
  const other = await store.createDeck('Other deck');
  const session = { installationId: 'fixture', sessionId: 'rows', epoch: 1 };
  await store.openSession('rows-session', session);
  const ids = {};
  for (const state of ['completed', 'loading', 'failed']) {
    const { pageId } = await store.capture(`row-${state}`, { session, mainKey: `${state} entry`, snapshot: deck }); ids[state] = pageId;
    const [front, back] = modulesOf(await store.page(pageId));
    await store.stage(front.attemptId, { ok: true, text: `${state} entry` });
    await store.publish(`row-front-${state}`, { attemptId: front.attemptId, session });
    if (state === 'completed') {
      await store.stage(back.attemptId, { ok: true, text: '== Englisch ==\n=== Bedeutungen ===\n: [1] erledigter Eintrag\n=== Beispiele ===\n: [1] Done.\n:: Erledigt.' });
      await store.publish('row-completed-back', { attemptId: back.attemptId, session });
    } else if (state === 'failed')
      await store.failAttempt(back.attemptId);
  }
  ids.neutral = (await store.createPage('row-neutral', { deckId: deck.id, mainKey: 'neutral entry' })).pageId;
  await signIn(a.page);

  // Recent captures: nothing for completed work, words for the rest.
  const capture = text => a.page.locator('.capture').filter({ has: a.page.getByText(text, { exact: true }) });
  await capture('completed entry').waitFor();
  assert.equal(await a.page.locator('.capture .badge, .capture .state-icon').count(), 0);
  assert.equal(await capture('completed entry').locator('.list-status').count(), 0);
  assert.equal(await capture('completed entry').locator('.meaning-line').textContent(), 'erledigter Eintrag');
  assert.equal(await capture('loading entry').locator('.list-status').textContent(), 'Generating 1 of 2');
  assert.equal(await capture('failed entry').locator('.list-status').textContent(), 'Generation failed');
  assert.equal(await capture('failed entry').getAttribute('data-state'), 'failed');
  await a.worker.evaluate(async (deck) => {
    const now = new Date().toISOString();
    await chrome.storage.local.set({
      'capture-visual-saving': { operationId: 'visual-saving', state: 'saving', createdAt: now, payload: { mainKey: 'Saving example', snapshot: deck } },
      'capture-visual-failed': { operationId: 'visual-failed', state: 'pending', error: 'Controlled save failure', createdAt: now, payload: { mainKey: 'Unsaved example', snapshot: deck } }
    });
  }, deck);
  const unsaved = capture('Unsaved example'), saving = capture('Saving example');
  await unsaved.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  assert.equal(await unsaved.getAttribute('data-state'), 'unsaved');
  assert.equal(await unsaved.locator('.list-status').textContent(), 'Not saved');
  assert.equal(await unsaved.getByText('Controlled save failure', { exact: true }).count(), 1);
  assert.equal(await saving.getAttribute('data-state'), 'saving');
  assert.equal(await saving.locator('.list-status').textContent(), 'Saving to your account');
  assert.equal(await saving.getByRole('link').count(), 0, 'an unsaved capture has no page to open');
  for (const theme of ['light', 'dark']) {
    await chooseAppearance(a.page, theme);
    await a.page.screenshot({ path: `artifacts/v0.6.0-dashboard-${theme}.png`, fullPage: true });
  }
  await a.worker.evaluate(() => chrome.storage.local.remove(['capture-visual-saving', 'capture-visual-failed']));
  await capture('failed entry').getByRole('button', { name: 'Retry…', exact: true }).click();
  await pageReady(a.page);
  assert.ok(a.page.url().endsWith(`#page/${ids.failed}`), 'Retry… opens the page; the list starts no generation');
  assert.equal((await store.page(ids.failed)).status, 'failed');

  // The deck list: List by default, rows in the same quiet states.
  await a.page.goto(a.page.url().replace(/#.*$/, `#deck/${deck.id}`));
  const row = state => a.page.locator(`[data-page-id="${ids[state]}"]`);
  await row('completed').waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'List', exact: true }).getAttribute('aria-pressed'), 'true', 'List is the default layout');
  for (const state of Object.keys(ids)) {
    assert.equal(await row(state).getAttribute('data-state'), state);
    assert.equal(await row(state).getByRole('link').count(), 1);
  }
  assert.equal(await row('completed').locator('.list-status').count(), 0);
  assert.equal(await row('neutral').locator('.list-status').count(), 0);
  assert.equal(await row('completed').locator('.meaning-line').textContent(), 'erledigter Eintrag');
  assert.equal(await row('completed').getByRole('img').getAttribute('aria-label'), '2 modules filled');
  assert.equal(await row('neutral').getByRole('img').count(), 0, 'a page with nothing filled shows no marks');
  assert.equal(await row('loading').locator('.list-status').textContent(), 'Generating 1 of 2');
  assert.equal(await row('failed').getByRole('button', { name: 'Retry…', exact: true }).count(), 1);
  assert.deepEqual(await a.page.locator('.group-heading').allTextContents(), ['Today'], 'creation-time orders group by date');
  for (const theme of ['light', 'dark']) {
    await chooseAppearance(a.page, theme);
    await row('completed').getByRole('link').focus();
    await a.page.screenshot({ path: `artifacts/v0.6.0-list-${theme}.png`, fullPage: true });
    const report = await a.page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = color => {
        const rgb = color.trim().replace('#', '').match(/../g).map(value => parseInt(value, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const ratio = (a, b) => { const [hi, lo] = [a, b].map(name => luminance(style.getPropertyValue(`--${name}`))).sort((a, b) => b - a); return (hi + .05) / (lo + .05); };
      const backgrounds = ['ground', 'surface', 'surface-hover', 'surface-active', 'status-failed-bg'];
      return [
        ...backgrounds.flatMap(bg => ['ink', 'ink-soft', 'ink-muted'].map(fg => ({ pair: `${fg}/${bg}`, ratio: ratio(fg, bg), minimum: 4.5 }))),
        ...backgrounds.map(bg => ({ pair: `focus/${bg}`, ratio: ratio('focus', bg), minimum: 3 })),
        ...['ground', 'surface', 'surface-hover'].map(bg => ({ pair: `line-control/${bg}`, ratio: ratio('line-control', bg), minimum: 3 })),
        { pair: 'status-failed/status-failed-bg', ratio: ratio('status-failed', 'status-failed-bg'), minimum: 4.5 },
        ...['ground', 'surface'].map(bg => ({ pair: `status-busy/${bg}`, ratio: ratio('status-busy', bg), minimum: 3 })),
        { pair: 'on-ink/ink', ratio: ratio('on-ink', 'ink'), minimum: 4.5 }
      ];
    });
    for (const item of report) assert.ok(item.ratio >= item.minimum, `${theme} ${item.pair}: ${item.ratio.toFixed(2)}`);
    t.diagnostic(`${theme} minimum text ${Math.min(...report.filter(item => item.minimum === 4.5).map(item => item.ratio)).toFixed(2)}:1; minimum cue/focus/border ${Math.min(...report.filter(item => item.minimum === 3).map(item => item.ratio)).toFixed(2)}:1`);
  }
  const { sortPages } = await import('../extension/sorting.ts');
  const listed = () => a.page.locator('[data-page-id]').evaluateAll(rows => rows.map(row => row.dataset.pageId));
  for (const order of ['newest', 'oldest', 'az', 'za']) {
    await a.page.getByLabel('Sort pages', { exact: true }).selectOption(order);
    const expected = sortPages((await store.pages()).filter(page => page.deckId === deck.id).map(page => ({ id: page.id, createdAt: page.createdAt, mainKey: keyOf(page) })), order).map(page => page.id);
    await waitFor(async () => JSON.stringify(await listed()) === JSON.stringify(expected), `${order} page order loaded`);
    assert.equal(await a.page.locator('.group-heading').count(), order === 'az' || order === 'za' ? 0 : 1);
    for (const layout of ['Table', 'Gallery', 'List']) {
      await a.page.getByRole('button', { name: layout, exact: true }).click();
      assert.deepEqual(await listed(), expected, `${layout} keeps the ${order} order`);
    }
  }

  // The layout is remembered per deck on the installation.
  await a.page.getByRole('button', { name: 'Gallery', exact: true }).click();
  await a.page.reload();
  await a.page.locator('.page-card').first().waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Gallery', exact: true }).getAttribute('aria-pressed'), 'true');
  await a.page.goto(a.page.url().replace(/#.*$/, `#deck/${other.id}`));
  await a.page.getByRole('heading', { name: 'Other deck', exact: true }).waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'List', exact: true }).getAttribute('aria-pressed'), 'true', 'other decks keep their own layout');
  await a.page.goto(a.page.url().replace(/#.*$/, `#deck/${deck.id}`));
  await a.page.locator('.page-card').first().waitFor();
  await a.page.getByRole('button', { name: 'List', exact: true }).click();

  for (const target of ['entry', 'marks', 'space', 'keyboard']) {
    const completed = row('completed');
    if (target === 'entry') await completed.getByRole('link').click();
    else if (target === 'marks') await completed.getByRole('img').click();
    else if (target === 'space') {
      // Raw mouse clicks do not scroll; bring the row on screen first.
      await completed.scrollIntoViewIfNeeded();
      const box = await completed.boundingBox(); await a.page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
    } else { await completed.getByRole('link').focus(); await a.page.keyboard.press('Enter'); }
    await pageReady(a.page);
    assert.ok(a.page.url().endsWith(`#page/${ids.completed}`), target);
    await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
    await row('completed').waitFor();
  }
  await row('completed').getByRole('link').evaluate(node => {
    const selection = getSelection(), range = document.createRange(); range.selectNodeContents(node); selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  });
  await a.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.ok(a.page.url().endsWith(`#deck/${deck.id}`), 'selecting entry text does not navigate');

  // Long text in every layout, at a narrow width, without overflow.
  const completedKey = (await store.page(ids.completed)).components.find(item => item.moduleType === 'main-key');
  await store.savePage('row-long-text', { pageId: ids.completed, changes: [{ componentId: completedKey.id, content: textBlocks('LongWord'.repeat(40) + ' 幸福 — Grüße') }] });
  await a.page.reload();
  await row('completed').waitFor();
  await a.page.setViewportSize({ width: 390, height: 760 });
  for (const layout of ['List', 'Table', 'Gallery']) {
    await a.page.getByRole('button', { name: layout, exact: true }).click();
    await a.page.screenshot({ path: `artifacts/v0.6.0-${layout.toLowerCase()}-narrow.png`, fullPage: true });
    assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${layout} fits`);
  }
  await a.page.getByRole('button', { name: 'List', exact: true }).click();
  await a.page.emulateMedia({ forcedColors: 'active' });
  await row('failed').getByRole('link').focus();
  await a.page.screenshot({ path: 'artifacts/v0.6.0-list-forced-colors.png', fullPage: true });
  assert.equal(await row('failed').locator('.list-status').textContent(), 'Generation failed', 'status is a word, never colour alone');
  await row('neutral').getByRole('link', { name: 'neutral entry', exact: true }).press('Enter');
  await pageReady(a.page);
  assert.ok(a.page.url().endsWith(`#page/${ids.neutral}`));
});

test('manual page UI: per-card actions, drafts, leave choices, sorting, failed-save recovery, and deletion', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-manual-browser-'));
  const databaseKey = join(directory, 'account-fixture');
  let application = await createTestApplication(t, { databaseKey }); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  await a.page.getByRole('heading', { name: 'My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).click();
  await a.page.getByLabel('Main key', { exact: true }).fill('zebra');
  await a.page.getByLabel('Context (optional)', { exact: true }).fill('zoo animal');
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Continue editing', exact: true }).click();
  assert.equal(await a.page.getByLabel('Main key', { exact: true }).inputValue(), 'zebra');
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('link', { name: 'zebra', exact: true }).click();
  await (await cardButton(a.page, 'Generate German explanation + examples')).waitFor();
  const created = (await application.store.pages())[0];
  const shape = async () => (await application.store.page(created.id)).components.map(item => [item.moduleType, text(item)]);
  assert.equal(created.status, null, 'manual creation never generates');
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['context', 'zoo animal'], ['german-examples', '']]);
  assert.equal(await a.page.getByRole('button', { name: /^Retry/ }).count(), 0, 'nothing has generated, so nothing to retry');
  for (const removed of ['Edit page', 'Generate missing', 'Retry page']) {
    assert.equal(await a.page.getByRole('button', { name: removed, exact: true }).count(), 0, `no page-level ${removed} (D04)`);
  }
  // An empty component is only its tab, with its actions (0.6.2).
  const ungenerated = componentArticle(a.page, 'German explanation + examples');
  assert.equal(await ungenerated.getAttribute('data-empty'), 'true');
  assert.equal(await ungenerated.locator('.card-body').count(), 0);
  await ungenerated.getByRole('button', { name: 'Generate German explanation + examples', exact: true }).waitFor();

  // Shaping by dragging, each step saved at once.
  await addFromWindow(a.page, 'text');
  await componentArticle(a.page, 'Text').waitFor();
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['context', 'zoo animal'], ['german-examples', ''], ['text', '']]);
  await drag(a.page, cardTab(a.page, 'Text'), componentArticle(a.page, 'German explanation + examples'));
  await waitFor(async () => (await shape())[2][0] === 'text', 'Text moved up');
  assert.equal(await a.page.getByRole('button', { name: /^Move / }).count(), 0, 'no move buttons (D04)');
  // Deleting a component with content asks beside its tab, not in a dialog (0.6.3): Cancel lands
  // under the pointer, where Delete was, and the final Delete stands to its left.
  const askDelete = await cardButton(a.page, 'Delete Context');
  await a.page.locator('.card-actions[data-open]').evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished)));
  const was = await askDelete.boundingBox();
  await askDelete.click();
  const keep = a.page.getByRole('button', { name: 'Keep Context', exact: true });
  const confirmDelete = a.page.getByRole('button', { name: 'Yes, delete Context', exact: true });
  await keep.waitFor();
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'no dialog');
  assert.equal(await a.page.locator('.confirm-text').textContent(), 'Are you sure?');
  await a.page.locator('[data-confirm]').evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished)));
  assert.equal(await a.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'),
    [was.x + was.width / 2, was.y + was.height / 2]), 'Keep Context', 'Cancel is under the pointer');
  assert.ok((await confirmDelete.boundingBox()).x < (await keep.boundingBox()).x, 'the final Delete is to the left of Cancel');
  assert.equal(await a.page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Keep Context', 'focus is on Cancel');
  await a.page.locator('.shaping-list').screenshot({ path: 'artifacts/v0.6.3-confirm-delete.png' });
  await keep.click();
  assert.equal(await confirmDelete.count(), 0);
  assert.equal((await shape()).length, 4);
  await (await cardButton(a.page, 'Delete Context')).click();
  await confirmDelete.click();
  await waitFor(async () => (await shape()).length === 3, 'Context deleted');
  // An empty component goes at once, without asking.
  await addFromWindow(a.page, 'sentence-usage');
  await waitFor(async () => (await shape()).length === 4, 'Sentence usage added');
  await (await cardButton(a.page, 'Delete Sentence usage')).click();
  await waitFor(async () => (await shape()).length === 3, 'empty Sentence usage deleted at once');
  assert.equal(await a.page.locator('[data-confirm]').count(), 0, 'no question for an empty component');
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['text', ''], ['german-examples', '']]);
  // The main key is the page title, shown once: no card, no lock mark (0.6.3), and only Edit, always visible like Delete page.
  const header = a.page.locator('.page-header[data-type="main-key"]');
  assert.equal(await header.getByRole('img').count(), 0, 'no lock mark');
  await a.page.mouse.move(5, 5);
  assert.equal(await header.getByRole('button', { name: 'Edit Main key', exact: true }).evaluate(node => getComputedStyle(node).opacity), '1', 'Edit is visible without hovering');
  assert.equal(await a.page.getByRole('heading', { level: 1 }).textContent(), 'zebra');
  assert.equal(await a.page.locator('article.component[data-type="main-key"]').count(), 0, 'no separate main key card');
  for (const missing of ['Drag Main key', 'Delete Main key', 'Retry Main key', 'Generate Main key']) {
    assert.equal(await a.page.getByRole('button', { name: missing, exact: true }).count(), 0, `the main key has only Edit (${missing})`);
  }
  assert.equal(await componentArticle(a.page, 'Text').getAttribute('data-empty'), 'true');
  assert.equal(await componentArticle(a.page, 'Text').locator('.card-body, .add-text').count(), 0, 'no placeholder for an empty Text');

  // Editing is one card at a time, with Save and Cancel in the card.
  const mainKeyField = a.page.getByRole('textbox', { name: 'Edit Main key', exact: true });
  await a.page.getByRole('button', { name: 'Edit Main key', exact: true }).click();
  await a.page.getByRole('button', { name: 'Save', exact: true }).waitFor();
  assert.equal(await a.page.locator('.window-module[data-type="text"]').getAttribute('aria-disabled'), 'true', 'shaping waits until editing ends');
  assert.equal(await a.page.locator('.module-window .notice').count(), 0, 'no notice while editing (0.5.2)');
  assert.equal(await (await cardButton(a.page, 'Edit Text')).isDisabled(), true, 'one card at a time');
  await mainKeyField.fill('discard this');
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
  assert.equal(keyOf(await application.store.page(created.id)), 'zebra');
  await a.page.getByRole('link', { name: 'zebra', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit Main key', exact: true }).click();
  // Saving an empty main key keeps the editor open and says so inside the field.
  await mainKeyField.fill('');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(async () => await mainKeyField.getAttribute('placeholder') === 'Main key can not be empty.', 'the message stands inside the empty main key');
  assert.equal(await a.page.locator('.notice.error').count(), 0, 'no notice below the field');
  await mainKeyField.fill('cancel this');
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(keyOf(await application.store.page(created.id)), 'zebra');
  await (await cardButton(a.page, 'Edit Text')).click();
  await a.page.getByRole('textbox', { name: 'Edit Text', exact: true }).fill('saved own text');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(async () => (await shape())[1][1] === 'saved own text', 'Text saved from its card');
  await a.page.getByRole('button', { name: 'Edit Main key', exact: true }).click();
  await mainKeyField.fill('alpha');
  await application.close();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  assert.equal(await mainKeyField.inputValue(), 'alpha');
  application = (await createTestApplication(t, { databaseKey })); await application.start();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit Main key', exact: true }).waitFor();
  const saved = await application.store.page(created.id);
  assert.deepEqual(saved.components.map(item => [item.moduleType, text(item)]), [['main-key', 'alpha'], ['text', 'saved own text'], ['german-examples', '']]);
  assert.equal(saved.createdAt, created.createdAt);
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).click();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  // An empty main key says so inside its field, not in a notice below it (0.6.3).
  const newKey = a.page.getByLabel('Main key', { exact: true });
  await waitFor(async () => await newKey.getAttribute('placeholder') === 'Main key can not be empty.', 'the message stands inside the empty field');
  assert.equal(await newKey.getAttribute('aria-invalid'), 'true');
  assert.equal(await a.page.locator('.notice.error').count(), 0, 'no notice below the field');
  assert.equal(await a.page.evaluate(() => document.activeElement.id), 'main-key', 'the field takes focus');
  await a.page.screenshot({ path: 'artifacts/v0.6.3-empty-main-key.png' });
  await newKey.fill('aardvark');
  await a.page.getByRole('button', { name: /^(Save|Try saving again)$/ }).click();
  await pageReady(a.page);
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByLabel('Sort pages', { exact: true }).selectOption('az');
  await waitFor(async () => JSON.stringify(await a.page.locator('.page-rows .entry').allTextContents()) === JSON.stringify(['aardvark', 'alpha']), 'ascending page list loaded');
  await a.page.getByLabel('Sort pages', { exact: true }).selectOption('za');
  await waitFor(async () => JSON.stringify(await a.page.locator('.page-rows .entry').allTextContents()) === JSON.stringify(['alpha', 'aardvark']), 'descending page list loaded');
  await a.page.getByRole('link', { name: 'alpha', exact: true }).click();
  await a.page.getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await application.store.pages()).length, 2);
  await a.page.getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('link', { name: 'aardvark', exact: true }).waitFor();
  assert.equal((await application.store.pages()).length, 1);
});

test('retry UI: exact confirmation, a first Generate without warning, and a two-installation lock preserve drafts until explicit resubmission', { timeout: 35000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-retry-browser-'));
  let release;
  const application = await createTestApplication(t, {
    provider: {
      interpret: async () => ({ inputType: 'word_phrase', sourceLanguage: 'Chinese' }),
      generate: (_, signal) => new Promise((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }); })
    }
  });
  await useModules(application.store, ['sentence-usage', 'german-examples']);
  await application.start();
  const session = { installationId: 'fixture', sessionId: 'fixture', epoch: 1 };
  await application.store.openSession('fixture', session);
  const { pageId } = await application.store.capture('fixture-capture', { session, mainKey: '幸福', snapshot: (await application.store.snapshot()) });
  for (const item of modulesOf(await application.store.page(pageId))) {
    await application.store.stage(item.attemptId, { ok: true, text: 'saved original' });
    await application.store.publish(item.id, { attemptId: item.attemptId, session });
  }
  const a = await launch(join(directory, 'a')), b = await launch(join(directory, 'b'));
  t.after(async () => { await a.context.close(); await b.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page); await signIn(b.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await b.page.goto(`chrome-extension://${b.id}/app.html#page/${pageId}`);
  // Installation b edits the explanation card while a retries it.
  await (await cardButton(b.page, 'Edit German explanation + examples')).click();
  await b.page.getByRole('textbox', { name: 'Edit German explanation + examples', exact: true }).fill('draft back');
  const retryExplanation = () => cardButton(a.page, 'Retry German explanation + examples');
  await (await retryExplanation()).click();
  assert.equal(await a.page.getByRole('dialog').locator('p').textContent(), 'Retry will replace this component’s content, including your edits to it. The main key, Context, and other components will not change.');
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(text(modulesOf(await application.store.page(pageId))[1]), 'saved original');
  await (await retryExplanation()).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await waitFor(() => release, 'retry provider started');
  await waitFor(async () => (await retryExplanation()).isDisabled(), 'retry disables its control while generating');
  // Every Retry is briefly disabled while the request is in flight; once accepted, only the generating component stays locked.
  await waitFor(async () => (await cardButton(a.page, 'Retry Sentence usage')).isEnabled(), 'other components stay available');
  assert.equal(await (await retryExplanation()).isDisabled(), true);
  await b.page.getByRole('button', { name: 'Save', exact: true }).click();
  await b.page.getByRole('alert').filter({ hasText: 'still generating' }).waitFor();
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', '']);
  assert.equal(await b.page.getByRole('textbox', { name: 'Edit German explanation + examples', exact: true }).inputValue(), 'draft back');
  release('regenerated component');
  await waitFor(async () => modulesOf(await application.store.page(pageId))[1].status === 'completed', 'retry saved');
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', 'regenerated component']);
  await b.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await b.page.locator('.component-tools').waitFor({ state: 'detached' });
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', 'draft back']);

  // A deck change never reaches the page; a module dragged onto it generates from its card without a warning.
  await useModules(application.store, ['sentence-usage', 'german-examples', 'german-explanation']);
  await a.page.reload();
  await a.page.locator('h1.main-key').waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Generate German explanation', exact: true }).count(), 0, 'a deck change never reaches the page');
  await addFromWindow(a.page, 'german-explanation');
  await (await cardButton(a.page, 'Generate German explanation')).click();
  await waitFor(async () => modulesOf(await application.store.page(pageId)).filter(item => item.attemptId).length === 3, 'the added module generated');
  assert.equal(await a.page.getByRole('dialog').count(), 0);
});

// A page view has loaded once its header action is there (D04: no page-level Edit page).
const pageReady = page => page.getByRole('button', { name: 'Delete page', exact: true }).waitFor();
const windowModule = (page, type) => page.locator(`.window-module[data-type="${type}"] .window-module-body`);
// Adds a module from the window by dragging it to the end of the list, the way a pointer user does.
// Opens the module window's family group holding this module, when it is collapsed.
async function openFamily(source) {
  await source.waitFor({ state: 'attached' });
  const group = source.locator('xpath=ancestor::details[1]');
  if (await group.count() && !await group.evaluate(node => node.open)) await group.locator('summary').click();
}

async function addFromWindow(page, type, target = page.locator('.drop-end'), options = {}) {
  const viewport = page.viewportSize();
  if (viewport.height < 1400) await page.setViewportSize({ width: viewport.width, height: 1400 });
  await drag(page, windowModule(page, type), target, options);
}

// Pointer drags go through dnd-kit's activation distance, so move in steps.
async function drag(page, source, target, { below = false, above = false } = {}) {
  await openFamily(source);
  // A mouse cannot leave the viewport; the module window is sticky, so it stays in view.
  // The page may re-render once as its account refresh lands; scroll again if it did.
  await target.scrollIntoViewIfNeeded().catch(() => target.scrollIntoViewIfNeeded());
  const from = await source.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 4 });
  // Read the target once the drag is active, then aim at it in two passes in case the page scrolled.
  // The second pass corrects only for scrolling: a sortable target slides aside as the drag
  // reaches it, and following it would lead the pointer back to the dragged card's own slot.
  const to = await target.boundingBox();
  const scrolled = await page.evaluate(() => scrollY);
  for (let pass = 0; pass < 2; pass++) {
    const shift = scrolled - await page.evaluate(() => scrollY);
    await page.mouse.move(to.x + to.width / 2, to.y + shift + to.height * (below ? 0.8 : above ? 0.25 : 0.5), { steps: 8 });
  }
  await page.mouse.up();
  // dnd-kit swallows clicks for 50 ms after a drop so the release is not also a click.
  await new Promise(resolve => setTimeout(resolve, 100));
}

test('sidebar: the current deck stays marked on a page while the account refreshes', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-sidebar-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['german-examples']);
  const session = { installationId: 'fixture', sessionId: 'sidebar', epoch: 1 };
  await store.openSession('sidebar-session', session);
  const { pageId } = await store.capture('sidebar-page', { session, mainKey: '幸福', snapshot: await store.snapshot() });
  const [examples] = modulesOf(await store.page(pageId));
  await store.stage(examples.attemptId, { ok: true, text: 'Glück' });
  await store.publish('sidebar-publish', { attemptId: examples.attemptId, session });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.locator('h1.main-key').waitFor();
  await a.page.locator('#sidebar .nav-item[aria-current="page"]').filter({ hasText: 'My Deck' }).waitFor();
  // Record every sidebar rebuild and whether My Deck was still marked after it.
  const watch = () => a.page.evaluate(() => {
    window.sidebarLog = [];
    new MutationObserver(() => window.sidebarLog.push(Boolean(document.querySelector('#sidebar .nav-decks [aria-current="page"]'))))
      .observe(document.querySelector('#sidebar'), { childList: true });
  });
  const log = () => a.page.evaluate(() => window.sidebarLog);
  // The first refresh after loading may still bring what the background synced meanwhile.
  await new Promise(resolve => setTimeout(resolve, 5500));
  await watch();
  // Two more refresh cycles with nothing changed: nothing is redrawn.
  await new Promise(resolve => setTimeout(resolve, 11000));
  assert.deepEqual(await log(), [], 'an unchanged account does not redraw the sidebar');
  // A real change redraws it, and My Deck stays marked throughout.
  await store.capture('sidebar-second', { session, mainKey: '快乐', snapshot: await store.snapshot() });
  await a.page.locator('#sidebar .nav-count').filter({ hasText: '2' }).waitFor({ timeout: 12000 });
  await new Promise(resolve => setTimeout(resolve, 500));
  const redraws = await log();
  assert.ok(redraws.length > 0, 'the change redrew the sidebar');
  assert.ok(redraws.every(Boolean), `My Deck stays marked through every redraw (${JSON.stringify(redraws)})`);
});

test('page view: main key tiers, Show all, rendered and plain content, quiet card status, and module window search and families', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-page-view-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['context', 'german-examples', 'sentence-usage']);
  const session = { installationId: 'fixture', sessionId: 'page-view', epoch: 1 };
  await store.openSession('page-view-session', session);
  const passage = Array.from({ length: 30 }, (_, index) => `Sentence number ${index + 1} of a long passage that keeps going.`).join(' ');
  const pages = {}, keys = {};
  for (const [name, key] of [['word', '幸福'], ['phrase', 'to bite off more than you can chew'], ['sentence', 'Sie lächelte und sagte, dass sie nie wieder an diesen Ort zurückkehren wolle.'], ['passage', passage]]) {
    const { pageId } = await store.capture(`page-view-${name}`, { session, mainKey: key, snapshot: await store.snapshot() });
    pages[name] = pageId; keys[name] = key;
    const [examples, usage] = modulesOf(await store.page(pageId));
    await store.stage(examples.attemptId, { ok: true, text: name === 'word' ? 'My own edited explanation.\n=== not a contract' : '== Englisch ==\n=== Bedeutungen ===\n: [1] Bedeutung' });
    await store.publish(`page-view-examples-${name}`, { attemptId: examples.attemptId, session });
    await store.failAttempt(usage.attemptId);
  }
  await signIn(a.page);
  const open = async name => {
    await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pages[name]}`);
    await a.page.locator('h1.main-key').filter({ hasText: keys[name] }).waitFor();
  };
  for (const name of ['word', 'phrase', 'sentence', 'passage']) {
    await open(name);
    assert.equal(await a.page.locator('h1.main-key').getAttribute('data-tier'), name);
    assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} fits`);
  }
  // A passage shows six lines and Show all; the heading keeps the whole text.
  const title = a.page.locator('h1.main-key');
  assert.equal(await title.textContent(), passage);
  const lines = async () => title.evaluate(node => Math.round(node.clientHeight / parseFloat(getComputedStyle(node).lineHeight)));
  assert.equal(await lines(), 6);
  await a.page.getByRole('button', { name: 'Show all', exact: true }).click();
  assert.ok(await lines() > 6);
  await a.page.getByRole('button', { name: 'Show less', exact: true }).click();
  assert.equal(await lines(), 6);

  // Text outside the render contract stays plain and literal; a failed card says so beside a visible Retry.
  await open('word');
  const examples = componentArticle(a.page, 'German explanation + examples');
  assert.equal(await examples.locator('pre').textContent(), 'My own edited explanation.\n=== not a contract');
  assert.equal(await examples.locator('.list-status').count(), 0, 'a completed card shows no status');
  const failed = componentArticle(a.page, 'Sentence usage');
  assert.equal(await failed.locator('.list-status').textContent(), 'Generation failed');
  // Actions wait inside the tab until it is clicked (D07); a failed card keeps its Retry out.
  await failed.getByRole('button', { name: 'Retry Sentence usage', exact: true }).waitFor();
  assert.equal(await failed.getByRole('button', { name: 'Edit Sentence usage', exact: true }).count(), 0, 'only Retry waits beside a failed tab');
  assert.equal(await examples.locator('.card-actions').count(), 0, 'no actions until the tab is clicked');
  // The tag is two buttons edge to edge: the six dots at its left end, the label to its right end.
  await examples.locator('.card-tab').scrollIntoViewIfNeeded();
  assert.deepEqual(await examples.locator('.card-tab').evaluate(node => {
    const box = node.getBoundingClientRect();
    return [2, box.width / 2, box.width - 2].map(x => document.elementFromPoint(box.left + x, box.top + box.height / 2)?.closest('button')?.className);
  }), ['menu-button', 'tab-button', 'tab-button']);
  await examples.hover();
  assert.equal(await examples.locator('.card-actions').count(), 0, 'hovering no longer shows actions');
  await cardTab(a.page, 'German explanation + examples').click();
  assert.deepEqual(await examples.locator('.card-actions button').allTextContents(), ['Edit', 'Retry', 'Fold', 'Delete']);
  assert.equal(await cardTab(a.page, 'German explanation + examples').getAttribute('aria-expanded'), 'true');
  assert.equal(await examples.locator('.card-actions button').first().evaluate(node => getComputedStyle(node).animationName), 'eject', 'the actions eject from the tab');
  await a.page.mouse.click(5, 5);
  assert.equal(await examples.locator('.card-actions').count(), 0, 'a click elsewhere puts them back');
  // Fold: the card slides shut to its tab and stays folded in this browser; Unfold opens it again.
  await (await cardButton(a.page, 'Fold German explanation + examples')).click();
  assert.equal(await examples.getAttribute('data-folded'), 'true');
  assert.match(await examples.locator('.card-fold').evaluate(node => getComputedStyle(node).transitionProperty), /grid-template-rows/, 'folding moves smoothly');
  await waitFor(async () => (await examples.locator('.card-fold').evaluate(node => node.getBoundingClientRect().height)) < 1, 'the content folds away');
  assert.equal(await examples.locator('.card-fold-inner').evaluate(node => node.inert), true, 'folded content is out of reach');
  await a.page.reload();
  await examples.locator('.card-tab').waitFor();
  assert.equal(await examples.getAttribute('data-folded'), 'true', 'the fold is remembered');
  await (await cardButton(a.page, 'Unfold German explanation + examples')).click();
  await waitFor(async () => (await examples.locator('.card-fold').evaluate(node => node.getBoundingClientRect().height)) > 20, 'the content unfolds');
  assert.equal(await examples.getAttribute('data-folded'), null);
  // From the keyboard: Enter ejects them, Escape puts them back and returns to the tab.
  await cardTab(a.page, 'German explanation + examples').focus();
  await a.page.keyboard.press('Enter');
  await examples.getByRole('button', { name: 'Edit German explanation + examples', exact: true }).waitFor();
  await a.page.keyboard.press('Escape');
  assert.equal(await examples.locator('.card-actions').count(), 0);
  assert.equal(await a.page.evaluate(() => document.activeElement.className), 'tab-button');
  // The six dots open the card's menu; its entries are placeholders.
  await a.page.getByRole('button', { name: 'More for German explanation + examples', exact: true }).click();
  const menu = a.page.getByRole('menu', { name: 'More for German explanation + examples' });
  assert.deepEqual(await menu.getByRole('menuitem').evaluateAll(items => items.map(item => [item.firstChild.textContent, item.getAttribute('aria-disabled')])),
    [['Duplicate', 'true'], ['Copy text', 'true'], ['Move to page…', 'true']]);
  await a.page.keyboard.press('Escape');
  // A menu lies above the cards below it, their tabs included: Context is empty, so the next tab is right under it.
  await a.page.getByRole('button', { name: 'More for Context', exact: true }).click();
  const contextMenu = a.page.getByRole('menu', { name: 'More for Context' });
  const covered = await contextMenu.getByRole('menuitem').evaluateAll(items => items.filter(item => {
    const box = item.getBoundingClientRect();
    return !document.elementFromPoint(box.left + 8, box.top + box.height / 2)?.closest('[role="menu"]');
  }).map(item => item.firstChild.textContent));
  assert.deepEqual(covered, [], 'no menu entry is hidden under the next card');
  await a.page.keyboard.press('Escape');
  assert.equal(await contextMenu.count(), 0);
  for (const theme of ['light', 'dark']) {
    await chooseAppearance(a.page, theme);
    await a.page.screenshot({ path: `artifacts/v0.6.0-page-${theme}.png`, fullPage: true });
  }

  // The module window groups by family, opens the families already here, and searches.
  const window = a.page.locator('.module-window');
  // How to drag waits behind the "?" beside the window's heading: hover shows it, a click keeps it, Escape closes it.
  const help = window.getByRole('button', { name: 'How to add modules', exact: true });
  const helpText = window.getByRole('note');
  assert.equal(await helpText.isVisible(), false, 'the explanation is hidden at first');
  await help.hover();
  await helpText.waitFor();
  assert.equal(await helpText.textContent(), 'Drag a module into the page, or back here to put it back. From the keyboard: Space picks it up, the arrow keys move it, Space drops it, Escape puts it back.');
  await a.page.mouse.move(5, 5);
  await helpText.waitFor({ state: 'hidden' });
  await help.click(); await a.page.mouse.move(5, 5);
  assert.equal(await helpText.isVisible(), true, 'a click keeps it open');
  await window.screenshot({ path: 'artifacts/v0.6.3-module-help.png' });
  await a.page.keyboard.press('Escape');
  await helpText.waitFor({ state: 'hidden' });
  const families = await window.locator('details').evaluateAll(nodes => nodes.map(node => [node.querySelector('summary').textContent, node.open]));
  assert.deepEqual(families, [['Meaning1', false], ['Usage2', true], ['Notes2', true]]);
  assert.equal(await window.locator('.window-module[data-type="sentence-usage"]').getByText('Already here').count(), 1);
  await window.getByLabel('Search modules', { exact: true }).fill('translations');
  assert.deepEqual(await window.locator('.window-module:visible').evaluateAll(nodes => nodes.map(node => node.dataset.type)), ['german-examples']);
  await window.getByLabel('Search modules', { exact: true }).fill('nothing like this');
  await window.getByText('No module matches “nothing like this”.').waitFor();
  await window.getByLabel('Search modules', { exact: true }).fill('');
  assert.equal(await window.locator('.window-module').count(), 5);
  await a.page.setViewportSize({ width: 390, height: 800 });
  await a.page.screenshot({ path: 'artifacts/v0.6.0-page-narrow.png', fullPage: true });
  assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('generation reveal: finished content rises into its card and is announced; reduced motion keeps the state without movement', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-reveal-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['german-explanation', 'german-examples']);
  const session = { installationId: 'fixture', sessionId: 'reveal', epoch: 1 };
  await store.openSession('reveal-session', session);
  const { pageId } = await store.capture('reveal-capture', { session, mainKey: '幸福', snapshot: await store.snapshot() });
  const [explanation, examples] = modulesOf(await store.page(pageId));
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = name => componentArticle(a.page, name);
  await card('German explanation').locator('.list-status').filter({ hasText: 'Generating' }).waitFor();

  await store.stage(explanation.attemptId, { ok: true, text: '== Chinesisch ==\n=== Bedeutungen ===\n: [1] Glück' });
  await store.publish('reveal-publish-1', { attemptId: explanation.attemptId, session });
  await card('German explanation').locator('.card-body[data-reveal] .meanings li').waitFor({ timeout: 15000 });
  assert.equal(await card('German explanation').getByRole('status').textContent(), 'German explanation generated.');
  assert.notEqual(await card('German explanation').locator('.meanings li').evaluate(node => getComputedStyle(node).animationName), 'none', 'the content rises');

  // Reduced motion: the same state, shown at once.
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  await store.failAttempt(examples.attemptId);
  await card('German explanation + examples').locator('.list-status').filter({ hasText: 'Generation failed' }).waitFor({ timeout: 15000 });
  assert.equal(await card('German explanation + examples').getByRole('status').textContent(), 'German explanation + examples: generation failed.');
  const durations = await a.page.evaluate(() => [...document.querySelectorAll('.component, .component *, .card-actions')]
    .map(node => getComputedStyle(node)).flatMap(style => [style.animationDuration, style.transitionDuration].flatMap(value => value.split(', ')))
    .map(value => parseFloat(value) * (value.endsWith('ms') ? 1 : 1000)));
  assert.ok(Math.max(...durations) <= 0.01, `nothing moves under reduced motion (longest ${Math.max(...durations)} ms)`);
});

test('module window: drag modules onto a page and into deck settings, and reorder by drag and keyboard', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-shaping-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  // Tall enough that both the module window and its drop targets are on screen at once.
  await a.page.setViewportSize({ width: 1280, height: 1200 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'shaping', epoch: 1 };
  await store.openSession('shaping-session', session);
  const { pageId } = await store.capture('shaping-capture', { session, mainKey: '幸福', context: 'Wir sind 幸福.', snapshot: await store.snapshot() });
  const types = async () => (await store.page(pageId)).components.map(item => item.moduleType);
  const card = name => a.page.locator('article.component').filter({ has: a.page.getByRole('heading', { name, exact: true }) });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await card('Context').waitFor();

  // Dragged over the page and back onto the window, a module is put back, not added.
  const textModule = await windowModule(a.page, 'text').boundingBox();
  const contextCard = await card('Context').boundingBox();
  await a.page.mouse.move(textModule.x + textModule.width / 2, textModule.y + textModule.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(contextCard.x + contextCard.width / 2, contextCard.y + contextCard.height / 4, { steps: 10 });
  // Over the page it stands in the card column as the card it will become, and the cards make room (0.6.3).
  const landingCard = a.page.locator('.landing-row .component[data-landing][data-type="text"]');
  await landingCard.waitFor();
  assert.equal(await a.page.locator('.drag-preview').count(), 0, 'no floating label over the page');
  assert.deepEqual(await a.page.locator('.shaping-list [data-row-id]').evaluateAll(rows => rows.map(row => row.dataset.rowId === 'landing' ? 'landing' : 'card')),
    ['landing', 'card', 'card'], 'it stands before Context');
  const columnLeft = async locator => Math.round((await locator.locator('.card-tab').boundingBox()).x);
  assert.equal(await columnLeft(landingCard), await columnLeft(card('Context')), 'aligned with the cards');
  await waitFor(async () => (await card('Context').boundingBox()).y > contextCard.y + 20, 'Context makes room');
  await a.page.locator('.shaping-list').screenshot({ path: 'artifacts/v0.6.3-drag-in.png' });
  await a.page.mouse.move(textModule.x + textModule.width / 2, textModule.y + textModule.height / 2, { steps: 10 });
  await a.page.locator('.module-window[data-over]').waitFor();
  assert.equal(await landingCard.count(), 0, 'nothing stands in the list over the window');
  await a.page.locator('.drag-preview').waitFor();
  await a.page.mouse.up();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(await types(), ['main-key', 'context', 'german-examples'], 'a module dropped back on the window is not added');
  assert.equal(await a.page.locator('.landing-row').count(), 0);

  // Drag Text from the window onto the upper half of the Context card: it lands before it.
  await drag(a.page, windowModule(a.page, 'text'), card('Context'), { above: true });
  await waitFor(async () => (await types()).includes('text'), 'Text dragged onto the page');
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german-examples']);
  assert.deepEqual((await store.deck((await store.page(pageId)).deckId)).modules.map(module => module.type),
    ['main-key', 'context', 'german-examples'], 'the deck is unchanged');

  // Reorder by dragging a handle to the end. The server's move response is held:
  // the new order must show at once and never snap back while it is saved (D04).
  await card('Text').waitFor();
  const handler = application.server.listeners('request')[0];
  application.server.removeListener('request', handler);
  let holdMoves = true; const heldMoves = [];
  application.server.on('request', (request, response) => {
    if (holdMoves && request.url === '/api/page/components/move') { heldMoves.push(() => handler(request, response)); return; }
    handler(request, response);
  });
  const headings = async () => ['Main key', ...await a.page.locator('.shaping-list article.component h2').allTextContents()];
  // Over the end zone the card moves only up and down, and the others make room as for the last place (0.6.3).
  const rowOf = heading => a.page.locator('.sortable-row').filter({ has: a.page.getByRole('heading', { name: heading, exact: true }) });
  // Wait for the cards to finish sliding into place after the add before aiming at one.
  await a.page.locator('.shaping-list').evaluate(list => Promise.all(list.getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished)));
  const from = await cardTab(a.page, 'Text').boundingBox(), end = await a.page.locator('.drop-end').boundingBox();
  await a.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 4 });
  await a.page.mouse.move(end.x + end.width / 2 + 120, end.y + end.height / 2, { steps: 12 });
  const shiftOf = heading => rowOf(heading).evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m42);
  await waitFor(async () => await shiftOf('German explanation + examples') < -20 && await shiftOf('Context') < -20, 'every card after it makes room');
  assert.equal(await rowOf('Text').evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m41), 0, 'the card stays in its column');
  await a.page.mouse.up();
  await waitFor(() => heldMoves.length === 1, 'move request reached the server');
  for (let sample = 0; sample < 5; sample++) {
    assert.deepEqual(await headings(), ['Main key', 'Context', 'German explanation + examples', 'Text'], 'the new order shows before the save finishes');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german-examples'], 'the move is still held');
  holdMoves = false; heldMoves.shift()();
  await waitFor(async () => (await types()).at(-1) === 'text', 'Text dragged to the end');
  assert.deepEqual(await types(), ['main-key', 'context', 'german-examples', 'text']);
  assert.deepEqual(await headings(), ['Main key', 'Context', 'German explanation + examples', 'Text']);

  // Keyboard reorder: Space picks the card up by its tab, the arrows move it, Space drops it.
  await cardTab(a.page, 'Text').focus();
  const announced = text => a.page.locator('[id^="DndLiveRegion"]').filter({ hasText: text }).waitFor({ state: 'attached' });
  await a.page.keyboard.press('Space');
  await announced('Text is over position 4.');
  // The sensor needs a moment after pickup before it moves.
  await new Promise(resolve => setTimeout(resolve, 300));
  await a.page.keyboard.press('ArrowUp');
  await announced('Text is over position 3.');
  await a.page.keyboard.press('ArrowUp');
  await announced('Text is over position 2.');
  await a.page.keyboard.press('Space');
  await waitFor(async () => (await types())[1] === 'text', 'Text moved up from the keyboard');
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german-examples']);
  await announced('Text was dropped.');
  assert.equal(await a.page.locator('.card-actions').count(), 0, 'Space drags; it never ejects the actions');

  // Keyboard add from the window: Space picks a module up, the arrows step through
  // the landing places (the end zone is last), Space drops it.
  await openFamily(windowModule(a.page, 'text'));
  await windowModule(a.page, 'text').focus();
  await a.page.keyboard.press('Space');
  await announced('Text is over');
  await new Promise(resolve => setTimeout(resolve, 300));
  for (let step = 0; step < 6; step++) await a.page.keyboard.press('ArrowDown');
  await announced('Text is over the end.');
  await a.page.keyboard.press('Space');
  await waitFor(async () => (await types()).length === 5, 'Text added from the keyboard');
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german-examples', 'text']);
  assert.equal(await a.page.locator('.module-window button:not(.help-button)').count(), 0, 'no Add buttons (D04)');

  // Deck settings take a dragged module too, and the main key stays first.
  const deckId = (await store.page(pageId)).deckId;
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  // Wait for the configuration itself, not only the page shell, before dragging.
  await a.page.locator('.module-block[data-type="german-examples"]').waitFor();
  await drag(a.page, windowModule(a.page, 'sentence-usage'), a.page.locator('.drop-end'));
  await a.page.locator('.module-block').filter({ hasText: 'Sentence usage' }).waitFor();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.deepEqual((await store.deck(deckId)).modules.map(module => module.type), ['main-key', 'context', 'german-examples', 'sentence-usage']);
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german-examples', 'text'], 'the page keeps its own modules');
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

test('assembled reliability: lost acknowledgments, worker suspension, abrupt origin exit, other installation, and cancellation', { timeout: 65000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-reliability-browser-'));
  const extension = join(directory, 'extension'); await cp(resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension'), extension, { recursive: true });
  await appendFile(join(extension, 'background.js'), '\nglobalThis.captureForTest = handleCapture;\n');
  const held = new Map(), calls = new Map(), canceled = new Set();
  const application = await createTestApplication(t, {
    provider: {
      interpret: async () => ({ inputType: 'word_phrase', sourceLanguage: 'Chinese' }),
      generate: ({ selectedText }, signal) => {
        calls.set(selectedText, (calls.get(selectedText) ?? 0) + 1);
        if (!selectedText.startsWith('hold-') && selectedText !== 'publication acknowledgment') return Promise.resolve(`Generated: ${selectedText}`);
        return new Promise((resolve, reject) => {
          held.set(selectedText, () => resolve(`Generated: ${selectedText}`));
          signal.addEventListener('abort', () => { canceled.add(selectedText); reject(Error('aborted')); }, { once: true });
        });
      }
    }
  });
  await useModules(application.store, ['sentence-usage', 'german-examples']);
  await application.start();
  const contexts = new Set();
  t.after(async () => { for (const context of contexts) await context.close().catch(() => { }); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const profile = join(directory, 'a');
  let a = await launch(profile, extension); contexts.add(a.context); await signIn(a.page);
  let reading = await a.context.newPage(); await reading.goto(apiOrigin + '/health');
  await loseNextAcknowledgment(a.worker, '/api/capture');
  await captureFrom(a, 'uncertain capture');
  await waitFor(async () => (await application.store.pages()).some(page => page.selectedText === 'uncertain capture'), 'uncertain capture committed');
  const captured = (await application.store.pages()).find(page => page.selectedText === 'uncertain capture');
  const attempts = modulesOf(captured).map(item => item.attemptId);
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await waitFor(async () => (await application.store.page(captured.id)).status === 'completed', 'uncertain capture recovered');
  assert.equal((await application.store.pages()).length, 1); assert.equal(calls.get('uncertain capture'), 1);
  assert.deepEqual(modulesOf(await application.store.page(captured.id)).map(item => item.attemptId), attempts);

  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${captured.id}`);
  await (await cardButton(a.page, 'Edit Sentence usage')).click();
  await a.page.getByRole('textbox', { name: 'Edit Sentence usage', exact: true }).fill('save with lost acknowledgment');
  await loseNextAcknowledgment(a.worker, '/api/page/save');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  const front = modulesOf(captured)[0];
  await waitFor(async () => text(modulesOf(await application.store.page(captured.id))[0]) === 'save with lost acknowledgment', 'original component save committed');
  await application.store.savePage('later-remote-edit', { pageId: captured.id, changes: [{ componentId: front.id, content: textBlocks('later remote edit') }] });
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await a.page.locator('.component-tools').waitFor({ state: 'detached' });
  assert.equal(text(modulesOf(await application.store.page(captured.id))[0]), 'later remote edit');
  assert.equal(calls.get('uncertain capture'), 1);

  await captureFrom(a, 'publication acknowledgment');
  const publicationPage = (await application.store.pages()).find(page => page.selectedText === 'publication acknowledgment');
  await waitFor(async () => modulesOf(await application.store.page(publicationPage.id))[0].status === 'completed', 'exact selection published before lost acknowledgment');
  await waitFor(() => held.has('publication acknowledgment'), 'publication generation started');
  await loseNextAcknowledgment(a.worker, '/api/publish');
  held.get('publication acknowledgment')();
  let pending;
  await waitFor(async () => {
    const receipts = await a.worker.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).filter(([key]) => key.startsWith('save-publish-')).map(([, value]) => value));
    // Wait for both server publications and removal of the successful receipt.
    // Otherwise a still-in-flight save can be mistaken for the deliberately lost acknowledgment.
    if ((await application.store.page(publicationPage.id)).status !== 'completed' || receipts.length !== 1) return false;
    pending = receipts[0];
    return true;
  }, 'publication acknowledgment was lost');
  assert.equal(pending.payload.payload.attemptId, modulesOf(publicationPage)[1].attemptId, 'the generated component lost its acknowledgment');
  const publishedAttempt = await application.store.attempt(pending.payload.payload.attemptId);
  await application.store.savePage('later-than-publication', { pageId: publishedAttempt.page_id, changes: [{ componentId: publishedAttempt.component_id, content: textBlocks('manual text after publication') }] });
  await waitFor(async () => await a.page.getByRole('button', { name: 'Try saving again', exact: true }).count() === 1, 'only the lost acknowledgment needs retry');
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await waitFor(async () => !(await a.worker.evaluate(async (id) => (await chrome.storage.local.get(`save-${id}`))[`save-${id}`], pending.operationId)), 'publication receipt recovered');
  assert.equal(text((await application.store.page(publishedAttempt.page_id)).components.find(item => item.id === publishedAttempt.component_id)), 'manual text after publication');

  await captureFrom(a, 'hold-worker');
  await waitFor(() => held.has('hold-worker'), 'worker test generation started');
  const oldSession = await a.worker.evaluate(async () => (await chrome.storage.session.get('session')).session);
  await a.worker.evaluate(() => { globalThis.workerProbe = 'old'; });
  // Keep Chrome open, but remove automatic wake sources while observing the stopped state.
  const pageURL = a.page.url();
  await a.page.close();
  await a.worker.evaluate(() => chrome.alarms.clear('recover'));
  const internals = await a.context.newPage(); await internals.goto('chrome://serviceworker-internals');
  const registration = internals.locator('.serviceworker-registration').filter({ hasText: a.worker.url() });
  await registration.getByRole('button', { name: 'Stop', exact: true }).click();
  await waitFor(async () => (await registration.locator('.serviceworker-running-status .value').textContent()) === 'STOPPED', 'product worker stopped');
  held.get('hold-worker')();
  a.page = await a.context.newPage(); await a.page.goto(pageURL);
  await pageReady(a.page);
  a.worker = a.context.serviceWorkers().find(worker => worker.url().includes(a.id));
  assert.equal(await a.worker.evaluate(() => globalThis.workerProbe), undefined);
  assert.deepEqual(await a.worker.evaluate(async () => (await chrome.storage.session.get('session')).session), oldSession);
  await waitFor(async () => (await application.store.pages()).find(page => page.selectedText === 'hold-worker')?.status === 'completed', 'worker suspension did not interrupt generation');
  await internals.close();

  const b = await launch(join(directory, 'b'), extension); contexts.add(b.context); await signIn(b.page);
  const otherReading = await b.context.newPage(); await otherReading.goto(apiOrigin + '/health');
  await captureFrom(a, 'hold-origin'); await captureFrom(b, 'hold-other');
  const interrupted = (await application.store.pages()).find(page => page.selectedText === 'hold-origin');
  await waitFor(async () => modulesOf(await application.store.page(interrupted.id))[0].status === 'completed', 'sentence component persisted before crash');
  await waitFor(() => held.has('hold-origin') && held.has('hold-other'), 'both provider calls started before origin exit');
  const browser = a.context.browser(), protocol = await browser.newBrowserCDPSession();
  const { processInfo } = await protocol.send('SystemInfo.getProcessInfo'); const processId = processInfo.find(process => process.type === 'browser')?.id;
  assert.ok(processId); await protocol.detach();
  const disconnected = once(browser, 'disconnected'); process.kill(processId, 'SIGKILL'); await disconnected;
  contexts.delete(a.context);
  held.get('hold-origin')(); held.get('hold-other')();
  await waitFor(async () => (await application.store.attempt(modulesOf(interrupted)[1].attemptId)).result, 'origin result staged after crash');
  await waitFor(async () => (await application.store.pages()).find(page => page.selectedText === 'hold-other')?.status === 'completed', 'other installation completed');
  a = await launch(profile, extension); contexts.add(a.context);
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.deepEqual(modulesOf(await application.store.page(interrupted.id)).map(item => item.status), ['completed', 'failed']);
  await assert.rejects(async () => (await application.store.publish('stale-origin', { attemptId: modulesOf(interrupted)[1].attemptId, session: oldSession })), { code: 'stale_session' });

  await captureFrom(b, 'hold-delete'); await waitFor(() => held.has('hold-delete'), 'deletion test generation started');
  const deleted = (await application.store.pages()).find(page => page.selectedText === 'hold-delete');
  const auth = await b.worker.evaluate(async () => (await chrome.storage.local.get('auth')).auth);
  const response = await fetch(apiOrigin + '/api/page/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ operationId: 'delete-running', payload: { pageId: deleted.id } }) });
  assert.equal(response.status, 200); await waitFor(() => canceled.has('hold-delete'), 'deleted page canceled model work');
  await assert.rejects(async () => (await application.store.page(deleted.id)), { code: 'deleted' });
  const shared = await application.store.createDeck('Fresh shared default');
  await application.store.setDefault('remote-default-before-capture', shared.id);
  await captureFrom(b, 'fresh shared destination');
  assert.equal((await application.store.pages()).find(page => page.selectedText === 'fresh shared destination').deckId, shared.id);
});

test('dashboard capture feedback: shared appearance, original lifetime, originating tab, rerenders and zero windows', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-dashboard-feedback-'));
  const testingExtension = join(directory, 'extension');
  await cp(resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension'), testingExtension, { recursive: true });
  await appendFile(join(testingExtension, 'background.js'), `
    globalThis.captureForTest = handleCapture;
    globalThis.feedbackWindows = { calls: 0, events: 0 };
    const createWindow = chrome.windows.create.bind(chrome.windows);
    chrome.windows.create = (...args) => { globalThis.feedbackWindows.calls++; return createWindow(...args); };
    chrome.windows.onCreated.addListener(() => { globalThis.feedbackWindows.events++; });
  `);
  const application = await createTestApplication(t, {
    provider: {
      async interpret() { return { inputType: 'word_phrase', sourceLanguage: 'English' }; },
      async generate() { return 'Controlled explanation'; }
    }
  });
  await application.start();
  const a = await launch(join(directory, 'profile'), testingExtension);
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  const other = await a.context.newPage(); await other.goto(`chrome-extension://${a.id}/app.html`);
  await other.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  const reading = await a.context.newPage(); await reading.goto(apiOrigin + '/health');
  for (const theme of ['light', 'dark']) {
    await chooseAppearance(a.page, theme);
    assert.equal(await a.page.getByRole('heading', { name: 'Recent captures', exact: true }).evaluate(node => node.nextElementSibling === null), true, 'empty section has no replacement paragraph or gap');
    await a.page.screenshot({ path: `artifacts/v0.2.1-empty-dashboard-${theme}.png`, fullPage: true });
  }
  const tabId = await a.page.evaluate(async () => (await chrome.tabs.getCurrent()).id);
  const capture = text => a.worker.evaluate(async ({ tabId, text }) => globalThis.captureForTest(
    { menuItemId: 'capture', selectionText: text }, await chrome.tabs.get(tabId)), { tabId, text });
  const feedback = page => page.locator('vocabularium-feedback .feedback-item');
  const appearance = page => feedback(page).evaluate(async node => {
    // The popup springs in (D05); compare where it settles.
    await Promise.all(node.getAnimations().map(animation => animation.finished));
    const properties = ['fontFamily', 'fontSize', 'lineHeight', 'color', 'backgroundColor', 'padding', 'margin', 'border', 'borderRadius', 'boxShadow', 'maxWidth'];
    const inspect = element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return { css: Object.fromEntries(properties.map(key => [key, style[key]])), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return { text: node.textContent, item: inspect(node), close: inspect(node.querySelector('button')), label: node.querySelector('button').getAttribute('aria-label') };
  });
  for (const theme of ['light', 'dark']) {
    await chooseAppearance(a.page, theme);
    assert.equal(await a.page.locator('#app p').filter({ hasText: /Select text on a webpage/ }).count(), 0);
    await a.page.bringToFront();
    const originalURL = a.page.url();
    await capture(`dashboard-${theme}`);
    await feedback(a.page).waitFor();
    assert.equal(await feedback(a.page).count(), 1);
    assert.equal(await feedback(other).count(), 0);
    assert.equal(a.page.url(), originalURL);
    assert.equal(await a.page.evaluate(() => document.hasFocus()), true);
    await captureFrom(a, `external-${theme}`);
    await feedback(reading).waitFor();
    await a.page.mouse.move(0, 0); await reading.mouse.move(0, 0);
    assert.deepEqual(await appearance(a.page), await appearance(reading), 'dashboard matches the accepted external-page presentation');
    await a.page.screenshot({ path: `artifacts/v0.2.1-dashboard-feedback-${theme}.png` });
    await reading.screenshot({ path: `artifacts/v0.2.1-external-feedback-${theme}.png` });
    await a.page.getByRole('button', { name: 'Close capture feedback' }).click();
    await reading.getByRole('button', { name: 'Close capture feedback' }).click();
    assert.equal(await feedback(a.page).count(), 0);
  }
  // The renderer's DOM lifetime is observed independently of capture/network timing.
  await a.page.evaluate(() => {
    window.feedbackLifetimes = [];
    const starts = new Map();
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) if (node.nodeName === 'VOCABULARIUM-FEEDBACK') starts.set(node, performance.now());
        for (const node of record.removedNodes) if (starts.has(node)) window.feedbackLifetimes.push(performance.now() - starts.get(node));
      }
    }).observe(document.documentElement, { childList: true });
  });
  await capture('timer');
  const original = await feedback(a.page).elementHandle();
  await a.page.waitForTimeout(1200); // A restarted timer would now exceed the original deadline below.
  // Force an account-content rerender by changing local receipt storage.
  await a.worker.evaluate(() => chrome.storage.local.set({ 'capture-rerender-test': { state: 'saved' } }));
  await chooseAppearance(a.page, 'light');
  await a.page.waitForFunction(() => document.querySelector('vocabularium-feedback')?.dataset.theme === 'light');
  assert.equal(await original.evaluate(node => node.isConnected), true);
  await feedback(a.page).waitFor({ state: 'detached', timeout: 4000 });
  const [lifetime] = await a.page.evaluate(() => window.feedbackLifetimes);
  assert.ok(lifetime >= 2900 && lifetime < 3800, `original three-second lifetime: ${lifetime}ms`);
  await a.worker.evaluate(() => chrome.storage.local.remove('capture-rerender-test'));
  await Promise.all([(await capture('rapid-one')), (await capture('rapid-two'))]);
  assert.equal(await feedback(a.page).count(), 2);
  await a.page.getByRole('button', { name: 'Close capture feedback' }).first().click();
  assert.equal(await feedback(a.page).count(), 1);
  await feedback(a.page).waitFor({ state: 'detached', timeout: 4000 });
  // A dashboard cannot forge the worker-only route, even for a valid tab id.
  await other.evaluate(async (tabId) => { await chrome.runtime.sendMessage({ type: 'dashboard-feedback', tabId, message: 'Forged', css: '' }); }, tabId);
  assert.equal(await feedback(a.page).count(), 0);
  // Preserve the capture-time tab data through closure and navigation races.
  const closedTab = await other.evaluate(async () => ({ ...await chrome.tabs.getCurrent(), url: location.href }));
  await other.close();
  await a.worker.evaluate(tab => globalThis.captureForTest({ menuItemId: 'capture', selectionText: 'closed-origin' }, tab), closedTab);
  const navigatedTab = await a.page.evaluate(async () => ({ ...await chrome.tabs.getCurrent(), url: location.href }));
  await a.page.goto(apiOrigin + '/health');
  await a.worker.evaluate(tab => globalThis.captureForTest({ menuItemId: 'capture', selectionText: 'navigated-origin' }, tab), navigatedTab);
  assert.equal(await feedback(a.page).count(), 0);
  assert.equal(await feedback(reading).count(), 0);
  await waitFor(async () => (await application.store.pages()).length === 9 && (await application.store.pages()).every(page => page.status === 'completed'), 'each invocation saves and completes exactly one page');
  assert.equal(new Set((await application.store.pages()).map(page => page.selectedText)).size, 9);
  assert.deepEqual(await a.worker.evaluate(() => globalThis.feedbackWindows), { calls: 0, events: 0 });
});

test('save feedback: successful publication stays quiet in both lists, failures and retries remain recoverable', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-save-feedback-'));
  const extension = join(directory, 'extension'); await cp(resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension'), extension, { recursive: true });
  await appendFile(join(extension, 'background.js'), '\nglobalThis.captureForTest = handleCapture;\n');
  const application = await createTestApplication(t, {
    provider: {
      async interpret() { return { inputType: 'word_phrase', sourceLanguage: 'English' }; },
      async generate() { return 'Controlled explanation'; }
    }
  });
  await useModules(application.store, ['sentence-usage', 'german-examples']);
  const handler = application.server.listeners('request')[0];
  application.server.removeListener('request', handler);
  let hold = true, fail = false, requests = 0;
  const held = [];
  application.server.on('request', (request, response) => {
    if (request.url === '/api/publish') {
      requests++;
      if (hold) { held.push(() => handler(request, response)); return; }
      if (fail) { response.writeHead(503, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Controlled publication failure' })); return; }
    }
    handler(request, response);
  });
  let a;
  t.after(async () => { hold = false; for (const resume of held.splice(0)) resume(); await a?.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await application.start(); a = await launch(join(directory, 'profile'), extension); await signIn(a.page);
  const deck = await a.context.newPage(); await deck.goto(`chrome-extension://${a.id}/app.html`);
  await deck.getByRole('heading', { name: 'My Deck', exact: true }).click();
  await deck.getByRole('button', { name: 'Add page manually', exact: true }).waitFor();
  const pages = [a.page, deck];
  const recovery = page => page.locator('.notice').filter({ hasText: 'A change is waiting' });
  for (const page of pages) await page.evaluate(() => {
    window.recoveryPanels = [];
    new MutationObserver(() => {
      for (const node of document.querySelectorAll('.notice')) if (node.textContent.includes('A change is waiting')) window.recoveryPanels.push(node.textContent);
    }).observe(document.querySelector('#app'), { childList: true, subtree: true });
  });
  const capture = text => a.worker.evaluate(async (text) => {
    const [tab] = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [chrome.runtime.getURL('app.html')] });
    return globalThis.captureForTest({ menuItemId: 'capture', selectionText: text, pageUrl: tab.documentUrl }, { id: tab.tabId, url: tab.documentUrl });
  }, text);
  for (const theme of ['light', 'dark']) {
    hold = true;
    await chooseAppearance(a.page, theme);
    await capture(`successful-${theme}`);
    await waitFor(() => held.length > 0, 'publication is deliberately held');
    for (const [index, page] of pages.entries()) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await recovery(page).count(), 0, 'an in-flight save is not a failure');
      assert.deepEqual(await page.evaluate(() => window.recoveryPanels), [], 'no transient panel appeared');
      await page.screenshot({ path: `artifacts/v0.2.2-${index ? 'deck' : 'recent'}-${theme}.png`, fullPage: true });
    }
    hold = false; for (const resume of held.splice(0)) resume();
    await waitFor(async () => (await application.store.pages()).find(page => page.selectedText === `successful-${theme}`)?.status === 'completed', 'successful publication completes');
    await waitFor(async () => !(await a.worker.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).some(key => key.startsWith('save-')))), 'successful receipts cleared');
  }
  for (const page of pages) assert.deepEqual(await page.evaluate(() => window.recoveryPanels), [], 'success never inserts a recovery panel');
  fail = true;
  await capture('failed-publication');
  for (const page of pages) await recovery(page).first().waitFor();
  const receipts = await a.worker.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).filter(([key]) => key.startsWith('save-publish-')).map(([, value]) => value));
  assert.ok(receipts.length > 0); assert.ok(receipts.every(receipt => receipt.state === 'pending'));
  const count = (await application.store.pages()).length;
  fail = false; hold = true;
  await recovery(a.page).first().getByRole('button', { name: 'Try saving again' }).click();
  await waitFor(() => held.length > 0, 'explicit retry is in flight');
  for (const page of pages) assert.equal(await recovery(page).count(), receipts.length - 1, 'only the retried operation is hidden while active');
  hold = false; for (const resume of held.splice(0)) resume();
  // A retry has settled only when the worker removed its acknowledged receipt. Panel counts and
  // the absence of saving receipts also hold before the worker marks a clicked retry as saving.
  const acknowledged = (remaining, message) => waitFor(async () => {
    const states = await a.worker.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).filter(([key]) => key.startsWith('save-')).map(([, item]) => item.state));
    return states.length === remaining && states.every(state => state === 'pending') && await recovery(a.page).count() === remaining;
  }, message);
  await acknowledged(receipts.length - 1, 'retry completed');
  for (let remaining = receipts.length - 1; remaining > 0; remaining--) {
    await recovery(a.page).first().getByRole('button', { name: 'Try saving again' }).click();
    await acknowledged(remaining - 1, 'next retry acknowledged');
  }
  await waitFor(async () => await recovery(deck).count() === 0, 'both lists clear recovered saves');
  await waitFor(async () => (await application.store.pages()).every(page => page.status === 'completed'), 'all components recovered');
  assert.equal((await application.store.pages()).length, count, 'retry does not duplicate pages');
  assert.equal(count, 3); assert.ok(requests >= 6);
});

test('save feedback: worker loss exposes an interrupted save and replays its original operation', { timeout: 35000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-save-interruption-'));
  const application = await createTestApplication(t);
  const handler = application.server.listeners('request')[0];
  application.server.removeListener('request', handler);
  let hold = true, release;
  application.server.on('request', (request, response) => {
    if (hold && request.url === '/api/default-deck') {
      const end = response.end.bind(response);
      response.end = (...args) => { release = () => end(...args); return response; };
    }
    handler(request, response);
  });
  let a;
  t.after(async () => { release?.(); await a?.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await application.start();
  const original = (await application.store.snapshot()).id;
  const second = await application.store.createDeck('Second deck');
  a = await launch(join(directory, 'profile')); await signIn(a.page);
  await a.page.getByLabel('Options for Second deck').click();
  await a.page.locator('article').filter({ hasText: 'Second deck' }).getByRole('button', { name: 'Set as default', exact: true }).click();
  await waitFor(() => release, 'server committed the save but acknowledgment is held');
  assert.equal((await application.store.account()).defaultDeckId, second.id);
  const receipt = await a.worker.evaluate(async () => Object.entries(await chrome.storage.local.get(null)).find(([key]) => key.startsWith('save-'))[1]);
  assert.equal(receipt.state, 'saving');
  assert.equal(await a.page.getByRole('button', { name: 'Try saving again', exact: true }).count(), 0);
  await a.worker.evaluate(() => { globalThis.workerProbe = 'old'; });
  await a.page.close(); await a.worker.evaluate(() => chrome.alarms.clear('recover'));
  const internals = await a.context.newPage(); await internals.goto('chrome://serviceworker-internals');
  const registration = internals.locator('.serviceworker-registration').filter({ hasText: a.worker.url() });
  await registration.getByRole('button', { name: 'Stop', exact: true }).click();
  await waitFor(async () => (await registration.locator('.serviceworker-running-status .value').textContent()) === 'STOPPED', 'worker actually stopped');
  hold = false; release(); release = undefined;
  // A newer action must survive replay of the interrupted, already committed operation.
  await application.store.setDefault('later-default-change', original);
  a.page = await a.context.newPage(); await a.page.goto(`chrome-extension://${a.id}/app.html`);
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  a.worker = a.context.serviceWorkers().find(worker => worker.url().includes(a.id));
  assert.equal(await a.worker.evaluate(() => globalThis.workerProbe), undefined);
  const recovered = await a.worker.evaluate(async (id) => (await chrome.storage.local.get(`save-${id}`))[`save-${id}`], receipt.operationId);
  assert.deepEqual(recovered, { ...receipt, state: 'pending' });
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await waitFor(async () => !(await a.worker.evaluate(async (id) => (await chrome.storage.local.get(`save-${id}`))[`save-${id}`], receipt.operationId)), 'original operation acknowledged');
  assert.equal((await application.store.account()).defaultDeckId, original, 'replay does not overwrite the newer default');
  assert.equal((await application.store.account()).decks.length, 2);
});

test('upgrade: the first start discards earlier cached content, unsent captures, saves and drafts, and keeps sign-in', { timeout: 35000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-upgrade-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'profile'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page);
  const before = await a.worker.evaluate(async () => (await chrome.storage.local.get(['auth', 'installationId', 'dataVersion'])));
  assert.equal(before.dataVersion, 3);
  // Simulate an extension that last ran the karte/seite version.
  await a.page.evaluate(async () => {
    sessionStorage.setItem('karte-draft', JSON.stringify({ route: '#karte/old', karteId: 'old', texts: { seite: 'old draft' } }));
    await chrome.storage.local.remove('dataVersion');
    await chrome.storage.local.set({ account: { defaultDeckId: 'old', decks: [], kartes: [], recentKartes: [] },
      'capture-old': { operationId: 'old', state: 'pending', createdAt: new Date().toISOString(), payload: { selectedText: 'old capture', snapshot: { id: 'old', seites: [] } } },
      'save-old': { operationId: 'old-save', path: '/api/karte/save', payload: { operationId: 'old-save', payload: {} }, state: 'pending' } });
  });
  await a.page.goto(`chrome-extension://${a.id}/app.html#karte/old`);
  await a.page.reload();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  await a.page.getByRole('heading', { name: 'My Deck', exact: true }).waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Try saving again', exact: true }).count(), 0);
  assert.equal(await a.page.getByText('old capture').count(), 0);
  const after = await a.worker.evaluate(async () => chrome.storage.local.get(null));
  for (const key of ['capture-old', 'save-old']) assert.equal(after[key], undefined, key);
  assert.deepEqual([after.auth, after.installationId, after.dataVersion], [before.auth, before.installationId, 3]);
  assert.ok(Array.isArray(after.account.recentPages));
  assert.equal(await a.page.evaluate(() => sessionStorage.getItem('karte-draft')), null);
  assert.equal(await a.page.evaluate(() => sessionStorage.getItem('page-draft')), null);
});
