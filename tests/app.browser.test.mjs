import test, { createTestApplication } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { blockText } from '@vocabularium/domain/pages';
import { isContentType } from '@vocabularium/domain/page-modules';
import { resultFor, sentenceResult, text, textBlocks, useModules, wordResult, staged, fieldEdit } from './helpers/pages.mjs';
const keyOf = page => text(page.components.find(component => component.moduleType === 'main-key'));
// The bank entry with all four German facets, as structured content (D09).
const BANK = { core: { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer'] }, facets: { article: { singular: 'das Ufer', plural: 'die Ufer' },
    examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }], synonyms: ['Böschung'], antonyms: ['Strom'] } };
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
// In deck settings a module is an empty card (0.7.1): its tab ejects Remove.
async function removeFromDeck(page, label, nth = 0) {
  await componentArticle(page, label).nth(nth).locator('.tab-button').click();
  await page.getByRole('button', { name: `Remove ${label}`, exact: true }).click();
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
    // Each parent writes its own content, as structured data (D08, D09).
    async generate({ module, interpretation }) {
      if (interpretation.inputType === 'sentence') return sentenceResult(module.type === 'chinese' ? '我真的很幸福。' : 'Ich bin wirklich glücklich.');
      return module.type === 'chinese' ? { core: { kind: 'word', language: '汉语', key: '幸福', romanization: 'xìngfú', meanings: ['生活称心如意'] }, facets: {} }
        : wordResult(['Glück'], { examples: [{ sentence: '她很幸福。', translation: 'Sie ist glücklich.' }] }, { language: 'Chinesisch', key: '幸福' });
    }
  };
  let application = await createTestApplication(t, { databaseKey, provider });
  await useModules(application.store, ['chinese', 'german']);
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
  const generatedCard = componentArticle(b.page, 'German');
  await generatedCard.locator('.entry-core li').filter({ hasText: 'Glück' }).waitFor();
  assert.equal(await generatedCard.locator('.facet[data-facet="examples"] li em').textContent(), 'Sie ist glücklich.');
  assert.equal(await generatedCard.locator('.facet[data-facet="examples"] li mark').textContent(), '幸福');
  assert.equal(await generatedCard.getByText('===', { exact: false }).count(), 0, 'no literal markup');
  assert.equal(await generatedCard.locator('.badge, .list-status').count(), 0, 'a completed card shows no status');

  step('sentence and failed interpretation');
  await captureFrom(a, '我真的很幸福'); await captureFrom(a, 'fail');
  await waitFor(async () => (await application.store.pages()).find(page => page.selectedText === 'fail')?.status === 'failed', 'failed interpretation persisted');
  const sentencePage = (await application.store.pages()).find(page => page.selectedText === '我真的很幸福');
  // Every parent applies to a sentence as well as a word (D08).
  assert.deepEqual(modulesOf(sentencePage).map(item => [Boolean(text(item)), item.status]), [[true, 'completed'], [true, 'completed']]);
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
    async generate(request) { return resultFor(request, 'Glück'); }
  };
  const application = await createTestApplication(t, { provider });
  await useModules(application.store, ['context', 'german']);
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
  await removeFromDeck(a.page, 'Context');
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
    async generate(request) { return resultFor(request, 'Glück'); }
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
      async generate(request) { return resultFor(request, 'Controlled explanation'); }
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
  assert.equal(await a.page.locator('.deck-module').count(), 3, 'a new deck starts with the main key, Context and the German');
  // The main key is a tab like the other modules, with no lock mark (0.6.3), drag label, menu or Remove.
  const mainKeyBlock = a.page.locator('.deck-module[data-type="main-key"]');
  assert.equal(await mainKeyBlock.innerText(), 'Main key');
  assert.equal(await mainKeyBlock.getByRole('img').count(), 0, 'no lock mark');
  assert.equal(await mainKeyBlock.locator('.tab-button, button').count(), 0, 'no drag label, menu or Remove on the main key');
  await addFromWindow(a.page, 'chinese');
  const usage = a.page.locator('.sortable-row:not(.landing-row):not([data-dragging])').filter({ has: a.page.locator('.deck-module[data-type="chinese"]') });
  await usage.waitFor();
  // Dropped on the upper half of Chinese, German lands before it.
  await addFromWindow(a.page, 'german', usage, { above: true });
  await addFromWindow(a.page, 'chinese');
  await addFromWindow(a.page, 'chinese');
  assert.equal(await a.page.locator('.deck-module').count(), 7);
  assert.equal(await a.page.locator('.module-window .window-module').count(), 4, 'the window offers Context, Text and the two parents (D08)');
  // Every module and facet has its + (0.6.3; D04 had none).
  assert.equal(await a.page.locator('.window-module > .window-add').count(), 4, 'every module has its +');
  assert.equal(await a.page.locator('.window-facet .window-add').count(), 6, 'and every facet');
  assert.equal(await a.page.locator('.window-module[data-type="context"]').getAttribute('aria-disabled'), 'true', 'one Context per deck');
  assert.equal(await a.page.locator('.window-module[data-type="context"] .window-add').isDisabled(), true, 'a blocked module cannot be added');
  await a.page.getByText('There is already a Context.').waitFor();
  // The preview opens in a dialog from the button above the list, so deck settings keep the list-and-window layout (0.6.3).
  assert.equal(await a.page.locator('.sample-page').count(), 0, 'no preview beside the list');
  await a.page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = a.page.getByRole('dialog', { name: 'Preview' });
  await preview.waitFor();
  await preview.getByLabel('Sample input', { exact: true }).selectOption('sentence');
  assert.equal(await preview.locator('.preview').count(), 7, 'one preview per module, the main key included');
  assert.match(await preview.locator('.preview').nth(0).textContent(), /我真的很幸福/);
  // Every parent applies to a sentence: its translation, and the facets that apply (D08).
  assert.match(await preview.locator('.preview').nth(2).textContent(), /Ich bin wirklich glücklich/);
  assert.deepEqual(await preview.locator('.preview').nth(2).locator('.facet-tab-label').allTextContents(), ['Examples'], 'Article, Synonyms and Antonyms are for words');
  assert.equal(await preview.locator('.preview').nth(3).locator('.facet').count(), 0, 'a parent added from the window has its core only');
  assert.match(await preview.locator('.preview').nth(4).textContent(), /说话人表示自己非常满足/);
  const previewTypes = () => preview.locator('.sample-page .component').evaluateAll(nodes => nodes.map(node => node.dataset.type));
  const listTypes = () => a.page.locator('.shaping-list .deck-module').evaluateAll(nodes => nodes.slice(1).map(node => node.dataset.type));
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
  // A module's tab is two parts edge to edge, as on a page: the six dots at its left end, then its icon and name.
  const block = a.page.locator('.deck-module[data-type="chinese"]').first();
  await block.scrollIntoViewIfNeeded();
  assert.deepEqual(await block.locator('.card-tab').evaluate(node => {
    const box = node.getBoundingClientRect();
    return [5, box.width / 2].map(x => document.elementFromPoint(box.left + x, box.top + box.height / 2)?.closest('.menu-button, .tab-button')?.className);
  }), ['menu-button', 'tab-button']);
  // A module drags by its label (D07).
  await block.locator('.tab-button').focus();
  await a.page.keyboard.press('Space');
  await new Promise(resolve => setTimeout(resolve, 300));
  await a.page.keyboard.press('ArrowUp');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await a.page.locator('.deck-module').nth(2).getAttribute('data-type'), 'german', 'nothing dropped yet');
  // The others slide to make room.
  const slides = await a.page.locator('.shaping-list .sortable-row').evaluateAll(rows => rows.filter(row => !row.hasAttribute('data-dragging'))
    .map(row => getComputedStyle(row).transitionDuration));
  assert.ok(slides.length && slides.every(duration => parseFloat(duration) >= 0.2), `rows make room with a transition (${slides})`);
  await a.page.keyboard.press('Escape');
  assert.deepEqual(await listTypes(), ['context', 'german', 'german', 'chinese', 'chinese', 'chinese'], 'a cancelled drag keeps the order');
  assert.equal((await application.store.pages()).length, 0); assert.equal((await application.store.account()).decks.length, 1);
  await a.page.screenshot({ path: 'artifacts/m3-configuration.png', fullPage: true });
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor();
  const created = (await application.store.account()).decks.find(deck => deck.name === 'Everyday Chinese');
  assert.deepEqual(created.modules.map(module => module.type),
    ['main-key', 'context', 'german', 'german', 'chinese', 'chinese', 'chinese']);
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
    await application.store.stage(item.attemptId, staged(item.moduleType === 'german' ? 'Saved explanation' : ''));
    await application.store.publish(`fixture-${item.id}`, { attemptId: item.attemptId, session });
  }
  const before = (await application.store.page(pageId)).components.map(item => [item.moduleType, text(item)]);
  await a.page.getByLabel('Options for Everyday Chinese').click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Configure deck', exact: true }).click();
  // Two Germans in deck settings are numbered in their tabs (0.7.2).
  await componentArticle(a.page, 'German 2').waitFor();
  assert.deepEqual(await a.page.locator('.deck-module[data-type="german"] .tab-label').allTextContents(), ['German 1', 'German 2']);
  await removeFromDeck(a.page, 'German 1');
  for (let count = 6; count < 12; count++) await addFromWindow(a.page, 'chinese');
  assert.equal(await a.page.locator('.deck-module').count(), 12);
  assert.equal(await a.page.locator('.window-module[aria-disabled="false"]').count(), 0, 'the window is closed at twelve modules');
  await a.page.getByText('At most 12 modules, including the main key.').first().waitFor();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor();
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'changing the deck needs no content-loss confirmation');
  assert.deepEqual((await application.store.page(pageId)).components.map(item => [item.moduleType, text(item)]), before, 'deck changes never reach an existing page');
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await componentArticle(a.page, 'German 1').getByText('Saved explanation').waitFor();
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
  await addFromWindow(a.page, 'chinese');
  for (const appearance of ['dark', 'light']) {
    await theme(a.page, appearance);
    assert.equal(await a.page.getByLabel('Deck name', { exact: true }).inputValue(), 'Unsaved configuration');
    assert.equal(await a.page.locator('.deck-module').count(), 4);
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
  await useModules(store, ['chinese', 'german']);
  const deck = await store.snapshot();
  const other = await store.createDeck('Other deck');
  const session = { installationId: 'fixture', sessionId: 'rows', epoch: 1 };
  await store.openSession('rows-session', session);
  const ids = {};
  for (const state of ['completed', 'loading', 'failed']) {
    const { pageId } = await store.capture(`row-${state}`, { session, mainKey: `${state} entry`, snapshot: deck }); ids[state] = pageId;
    const [front, back] = modulesOf(await store.page(pageId));
    await store.stage(front.attemptId, staged(sentenceResult(`${state} entry`)));
    await store.publish(`row-front-${state}`, { attemptId: front.attemptId, session });
    if (state === 'completed') {
      await store.stage(back.attemptId, staged(wordResult(['erledigter Eintrag'], { examples: [{ sentence: 'Done.', translation: 'Erledigt.' }] })));
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
  // A never-generated component offers Retry too, which starts it at once (0.6.3; earlier Generate).
  await (await cardButton(a.page, 'Retry German')).waitFor();
  assert.equal(await a.page.getByRole('button', { name: /^Generate / }).count(), 0, 'no Generate');
  const created = (await application.store.pages())[0];
  const shape = async () => (await application.store.page(created.id)).components.map(item => [item.moduleType, text(item)]);
  assert.equal(created.status, null, 'manual creation never generates');
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['context', 'zoo animal'], ['german', '']]);
  assert.equal(await a.page.getByRole('button', { name: /^Retry / }).count(), 1, 'only the never-generated component offers Retry');
  for (const removed of ['Edit page', 'Generate missing', 'Retry page']) {
    assert.equal(await a.page.getByRole('button', { name: removed, exact: true }).count(), 0, `no page-level ${removed} (D04)`);
  }
  // An empty component is only its tab, with its actions (0.6.2).
  const ungenerated = componentArticle(a.page, 'German');
  assert.equal(await ungenerated.getAttribute('data-empty'), 'true');
  assert.equal(await ungenerated.locator('.card-body').count(), 0);
  await ungenerated.getByRole('button', { name: 'Retry German', exact: true }).waitFor();

  // Shaping by dragging, each step saved at once.
  await addFromWindow(a.page, 'text');
  await componentArticle(a.page, 'Text').waitFor();
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['context', 'zoo animal'], ['german', ''], ['text', '']]);
  await drag(a.page, cardTab(a.page, 'Text'), componentArticle(a.page, 'German'));
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
  await addFromWindow(a.page, 'chinese');
  await waitFor(async () => (await shape()).length === 4, 'Chinese added');
  await (await cardButton(a.page, 'Delete Chinese')).click();
  await waitFor(async () => (await shape()).length === 3, 'empty Chinese deleted at once');
  assert.equal(await a.page.locator('[data-confirm]').count(), 0, 'no question for an empty component');
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['text', ''], ['german', '']]);
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
  assert.deepEqual(saved.components.map(item => [item.moduleType, text(item)]), [['main-key', 'alpha'], ['text', 'saved own text'], ['german', '']]);
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

test('retry UI: exact confirmation asked beside the tab, a first Retry without warning, and a two-installation lock preserve drafts until explicit resubmission', { timeout: 35000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-retry-browser-'));
  let release;
  const application = await createTestApplication(t, {
    provider: {
      interpret: async () => ({ inputType: 'word_phrase', sourceLanguage: 'Chinese' }),
      generate: (_, signal) => new Promise((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }); })
    }
  });
  await useModules(application.store, ['chinese', 'german']);
  await application.start();
  const session = { installationId: 'fixture', sessionId: 'fixture', epoch: 1 };
  await application.store.openSession('fixture', session);
  const { pageId } = await application.store.capture('fixture-capture', { session, mainKey: '幸福', snapshot: (await application.store.snapshot()) });
  for (const item of modulesOf(await application.store.page(pageId))) {
    await application.store.stage(item.attemptId, staged('saved original'));
    await application.store.publish(item.id, { attemptId: item.attemptId, session });
  }
  const a = await launch(join(directory, 'a')), b = await launch(join(directory, 'b'));
  t.after(async () => { await a.context.close(); await b.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await signIn(a.page); await signIn(b.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await b.page.goto(`chrome-extension://${b.id}/app.html#page/${pageId}`);
  // Installation b edits the explanation card in its live editor while a retries it.
  await (await cardButton(b.page, 'Edit German')).click();
  const bMeanings = b.page.getByRole('textbox', { name: 'Meanings, German', exact: true });
  await bMeanings.click(); await b.page.keyboard.press('ControlOrMeta+a'); await b.page.keyboard.type('draft back');
  // Retrying content asks beside the tab, as Delete does, in the card's colour; no dialog (0.6.3).
  const retryExplanation = () => cardButton(a.page, 'Retry German');
  await (await retryExplanation()).click();
  const keepExplanation = a.page.getByRole('button', { name: 'Keep German', exact: true });
  await keepExplanation.waitFor();
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'no dialog');
  assert.equal(await a.page.locator('[data-confirm="retry"] .confirm-text').textContent(), 'Are you sure?');
  await a.page.locator('[data-confirm="retry"]').evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  await a.page.locator('.shaping-list').screenshot({ path: 'artifacts/v0.6.3-confirm-retry.png' });
  assert.notEqual(await a.page.locator('[data-confirm="retry"] .action-confirm').evaluate(node => getComputedStyle(node).backgroundColor),
    await a.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--status-failed').trim()), 'not red');
  await keepExplanation.click();
  assert.equal(text(modulesOf(await application.store.page(pageId))[1]), 'saved original');
  await (await retryExplanation()).click();
  await a.page.getByRole('button', { name: 'Yes, retry German', exact: true }).click();
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'the answer beside the tab is the confirmation');
  await waitFor(() => release, 'retry provider started');
  await waitFor(async () => (await retryExplanation()).isDisabled(), 'retry disables its control while generating');
  // Every Retry is briefly disabled while the request is in flight; once accepted, only the generating component stays locked.
  await waitFor(async () => (await cardButton(a.page, 'Retry Chinese')).isEnabled(), 'other components stay available');
  assert.equal(await (await retryExplanation()).isDisabled(), true);
  await b.page.getByRole('button', { name: 'Save', exact: true }).click();
  await b.page.getByRole('alert').filter({ hasText: 'still generating' }).waitFor();
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', '']);
  assert.equal(await bMeanings.textContent(), 'draft back', 'the draft is kept');
  release(wordResult('regenerated component'));
  await waitFor(async () => modulesOf(await application.store.page(pageId))[1].status === 'completed', 'retry saved');
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', 'regenerated component']);
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', 'regenerated component']);
  // An explicit resubmission saves the draft over the regenerated content (D09).
  await b.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await b.page.locator('.component-tools').waitFor({ state: 'detached' });
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', 'draft back']);

  // A deck change never reaches the page; a module dragged onto it generates from its card without a warning.
  await useModules(application.store, ['chinese', 'german', 'german']);
  await a.page.reload();
  await a.page.locator('h1.main-key').waitFor();
  assert.equal(await componentArticle(a.page, 'German').count(), 1, 'a deck change never reaches the page');
  await addFromWindow(a.page, 'german');
  // Two Germans on one page are numbered in their tabs (0.7.2).
  await componentArticle(a.page, 'German 2').locator('.tab-button').click();
  await componentArticle(a.page, 'German 2').getByRole('button', { name: 'Retry German 2', exact: true }).click();
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
  await drag(page, windowModule(page, type), target, { ...options, follow: true });
}

// Pointer drags go through dnd-kit's activation distance, so move in steps.
async function drag(page, source, target, { below = false, above = false, follow = false } = {}) {
  await openFamily(source);
  // A mouse cannot leave the viewport; the module window is sticky, so it stays in view.
  // The page may re-render once as its account refresh lands; scroll again if it did.
  await target.scrollIntoViewIfNeeded().catch(() => target.scrollIntoViewIfNeeded());
  const from = await source.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 4 });
  // Read the target once the drag is active, then aim at it in two passes in case the page scrolled.
  // Reordering corrects only for scrolling: a sortable target slides aside as the drag reaches
  // it, and following it would lead the pointer back to the dragged card's own slot. A module
  // from the window follows its target (`follow`), as the eye does when the entries make room.
  let to = await target.boundingBox();
  const scrolled = await page.evaluate(() => scrollY);
  for (let pass = 0; pass < 2; pass++) {
    if (follow && pass) { await new Promise(resolve => setTimeout(resolve, 300)); to = await target.boundingBox(); }
    const shift = follow ? 0 : scrolled - await page.evaluate(() => scrollY);
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
  await useModules(store, ['german']);
  const session = { installationId: 'fixture', sessionId: 'sidebar', epoch: 1 };
  await store.openSession('sidebar-session', session);
  const { pageId } = await store.capture('sidebar-page', { session, mainKey: '幸福', snapshot: await store.snapshot() });
  const [examples] = modulesOf(await store.page(pageId));
  await store.stage(examples.attemptId, staged('Glück'));
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
  await useModules(store, ['context', 'german', 'chinese']);
  const session = { installationId: 'fixture', sessionId: 'page-view', epoch: 1 };
  await store.openSession('page-view-session', session);
  const passage = Array.from({ length: 30 }, (_, index) => `Sentence number ${index + 1} of a long passage that keeps going.`).join(' ');
  const pages = {}, keys = {};
  for (const [name, key] of [['word', '幸福'], ['phrase', 'to bite off more than you can chew'], ['sentence', 'Sie lächelte und sagte, dass sie nie wieder an diesen Ort zurückkehren wolle.'], ['passage', passage]]) {
    const { pageId } = await store.capture(`page-view-${name}`, { session, mainKey: key, snapshot: await store.snapshot() });
    pages[name] = pageId; keys[name] = key;
    const [examples, usage] = modulesOf(await store.page(pageId));
    await store.stage(examples.attemptId, staged('Bedeutung'));
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

  // A card draws its structured content (D09), never stored syntax; a failed card says so beside a visible Retry.
  await open('word');
  const examples = componentArticle(a.page, 'German');
  assert.equal(await examples.locator('.entry-core li').textContent(), 'Bedeutung');
  assert.equal(await examples.locator('pre').count(), 0);
  assert.equal(await examples.locator('.list-status').count(), 0, 'a completed card shows no status');
  const failed = componentArticle(a.page, 'Chinese');
  assert.equal(await failed.locator('.list-status').textContent(), 'Generation failed');
  // Actions wait inside the tab until it is clicked (D07); a failed card keeps its Retry out.
  await failed.getByRole('button', { name: 'Retry Chinese', exact: true }).waitFor();
  assert.equal(await failed.getByRole('button', { name: 'Edit Chinese', exact: true }).count(), 0, 'only Retry waits beside a failed tab');
  assert.equal(await examples.locator('.card-actions').count(), 0, 'no actions until the tab is clicked');
  // The tag is two buttons edge to edge: the six dots at its left end, the label to its right end.
  await examples.locator('.card-tab').scrollIntoViewIfNeeded();
  assert.deepEqual(await examples.locator('.card-tab').evaluate(node => {
    const box = node.getBoundingClientRect();
    return [2, box.width / 2, box.width - 2].map(x => document.elementFromPoint(box.left + x, box.top + box.height / 2)?.closest('button')?.className);
  }), ['menu-button', 'tab-button', 'tab-button']);
  await examples.hover();
  assert.equal(await examples.locator('.card-actions').count(), 0, 'hovering no longer shows actions');
  await cardTab(a.page, 'German').click();
  assert.deepEqual(await examples.locator('.card-actions button').allTextContents(), ['Edit', 'Retry', 'Fold', 'Delete']);
  assert.equal(await cardTab(a.page, 'German').getAttribute('aria-expanded'), 'true');
  assert.equal(await examples.locator('.card-actions button').first().evaluate(node => getComputedStyle(node).animationName), 'eject', 'the actions eject from the tab');
  await a.page.mouse.click(5, 5);
  assert.equal(await examples.locator('.card-actions').count(), 0, 'a click elsewhere puts them back');
  // Fold: the card slides shut to its tab and stays folded in this browser; Unfold opens it again.
  await (await cardButton(a.page, 'Fold German')).click();
  assert.equal(await examples.getAttribute('data-folded'), 'true');
  assert.match(await examples.locator('.card-fold').evaluate(node => getComputedStyle(node).transitionProperty), /grid-template-rows/, 'folding moves smoothly');
  await waitFor(async () => (await examples.locator('.card-fold').evaluate(node => node.getBoundingClientRect().height)) < 1, 'the content folds away');
  assert.equal(await examples.locator('.card-fold-inner').evaluate(node => node.inert), true, 'folded content is out of reach');
  await a.page.reload();
  await examples.locator('.card-tab').waitFor();
  assert.equal(await examples.getAttribute('data-folded'), 'true', 'the fold is remembered');
  await (await cardButton(a.page, 'Unfold German')).click();
  await waitFor(async () => (await examples.locator('.card-fold').evaluate(node => node.getBoundingClientRect().height)) > 20, 'the content unfolds');
  assert.equal(await examples.getAttribute('data-folded'), null);
  // From the keyboard: Enter ejects them, Escape puts them back and returns to the tab.
  await cardTab(a.page, 'German').focus();
  await a.page.keyboard.press('Enter');
  await examples.getByRole('button', { name: 'Edit German', exact: true }).waitFor();
  await a.page.keyboard.press('Escape');
  assert.equal(await examples.locator('.card-actions').count(), 0);
  assert.equal(await a.page.evaluate(() => document.activeElement.className), 'tab-button');
  // The six dots open the card's menu; its entries are placeholders.
  await a.page.getByRole('button', { name: 'More for German', exact: true }).click();
  const menu = a.page.getByRole('menu', { name: 'More for German' });
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
  // Retrying a card with nothing in it, such as a failed one, starts at once: no question, no dialog (0.6.3).
  const usageBefore = (await store.page(pages.word)).components.find(item => item.moduleType === 'chinese').attemptId;
  await failed.getByRole('button', { name: 'Retry Chinese', exact: true }).click();
  await waitFor(async () => (await store.page(pages.word)).components.find(item => item.moduleType === 'chinese').attemptId !== usageBefore, 'the failed card retried');
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'no dialog');
  assert.equal(await a.page.locator('[data-confirm]').count(), 0, 'no question');
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
  assert.equal(await helpText.textContent(), 'Drag a module into the page, or back here to put it back. A facet goes onto a module of its own type. From the keyboard: Space picks it up, the arrow keys move it, Space drops it, Escape puts it back.');
  await a.page.mouse.move(5, 5);
  await helpText.waitFor({ state: 'hidden' });
  await help.click(); await a.page.mouse.move(5, 5);
  assert.equal(await helpText.isVisible(), true, 'a click keeps it open');
  await window.screenshot({ path: 'artifacts/v0.6.3-module-help.png' });
  await a.page.keyboard.press('Escape');
  await helpText.waitFor({ state: 'hidden' });
  const families = await window.locator('details').evaluateAll(nodes => nodes.map(node => [node.querySelector('summary').textContent, node.open]));
  assert.deepEqual(families, [['Translation2', true], ['Notes2', true]]);
  assert.equal(await window.locator('.window-module[data-type="chinese"]').getByText('Already here').count(), 1);
  // A parent is found by its facets too (D08).
  await window.getByLabel('Search modules', { exact: true }).fill('pinyin');
  assert.deepEqual(await window.locator('.window-module:visible').evaluateAll(nodes => nodes.map(node => node.dataset.type)), ['chinese']);
  await window.getByLabel('Search modules', { exact: true }).fill('nothing like this');
  await window.getByText('No module matches “nothing like this”.').waitFor();
  await window.getByLabel('Search modules', { exact: true }).fill('');
  assert.equal(await window.locator('.window-module').count(), 4);
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
  await useModules(store, ['chinese', 'german']);
  const session = { installationId: 'fixture', sessionId: 'reveal', epoch: 1 };
  await store.openSession('reveal-session', session);
  const { pageId } = await store.capture('reveal-capture', { session, mainKey: '幸福', snapshot: await store.snapshot() });
  const [explanation, examples] = modulesOf(await store.page(pageId));
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = name => componentArticle(a.page, name);
  // While it generates, the card is only its tab, with a spark running round the tab's edge (0.6.3).
  await card('Chinese').and(a.page.locator('[data-generating]')).waitFor();
  assert.equal(await card('Chinese').locator('.card-fold').isVisible(), false, 'no body while generating');
  assert.equal(await card('Chinese').locator('.list-status').count(), 0, 'no Generating line');
  assert.equal(await card('Chinese').locator('.spark i').first().evaluate(node => getComputedStyle(node).animationName), 'travel');
  // The comet runs round the tab's outline at a steady pace, corners and long edges alike.
  const steps = await card('Chinese').locator('.spark i').first().evaluate(async head => {
    const points = [];
    for (let frame = 0; frame < 90; frame++) {
      const box = head.getBoundingClientRect();
      points.push([box.x + box.width / 2, box.y + box.height / 2, performance.now()]);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return points.slice(1).map(([x, y, t], index) => Math.hypot(x - points[index][0], y - points[index][1]) / (t - points[index][2]))
      .filter(speed => speed > 0 && speed < 5);
  });
  const sorted = [...steps].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(sorted[Math.floor(sorted.length * .1)] > median * .6 && sorted[Math.floor(sorted.length * .9)] < median * 1.4,
    `steady speed (10th–90th percentile ${sorted[Math.floor(sorted.length * .1)].toFixed(3)}–${sorted[Math.floor(sorted.length * .9)].toFixed(3)} px/ms, median ${median.toFixed(3)})`);
  assert.equal(await card('Chinese').getByRole('status').first().textContent(), 'Chinese: generating');
  await a.page.locator('.shaping-list').screenshot({ path: 'artifacts/v0.6.3-generating.png' });

  await store.stage(explanation.attemptId, staged(wordResult(['生活称心如意'], {}, { language: '汉语', key: '幸福' })));
  await store.publish('reveal-publish-1', { attemptId: explanation.attemptId, session });
  // The spark does not vanish: it fades away as the content rises in.
  await card('Chinese').locator('.spark[data-ending]').waitFor({ state: 'attached', timeout: 15000 });
  await card('Chinese').locator('.spark').waitFor({ state: 'detached', timeout: 3000 });
  await card('Chinese').locator('.card-body[data-reveal] .entry-core li').waitFor({ timeout: 15000 });
  assert.equal(await card('Chinese').getByRole('status').textContent(), 'Chinese generated.');
  assert.notEqual(await card('Chinese').locator('.entry-core li').evaluate(node => getComputedStyle(node).animationName), 'none', 'the content rises');

  // Reduced motion: the same state, shown at once.
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  await store.failAttempt(examples.attemptId);
  await card('German').locator('.list-status').filter({ hasText: 'Generation failed' }).waitFor({ timeout: 15000 });
  assert.equal(await card('German').getByRole('status').textContent(), 'German: generation failed.');
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
  // Tall enough that both the module window, with the Translation family's facets open, and its drop targets are on screen at once.
  await a.page.setViewportSize({ width: 1280, height: 1700 });
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
  // Over the page it drags as a card does (0.6.3): the module itself, as the card it will become,
  // keeps to the card column while a gap opens where it would land and the cards make room.
  const landingCard = a.page.locator('.landing-row .component[data-landing][data-type="text"]');
  const moving = a.page.locator('.drag-preview .component[data-landing][data-type="text"]');
  await landingCard.waitFor({ state: 'attached' });
  await moving.waitFor();
  assert.equal(await landingCard.isVisible(), false, 'the gap is empty');
  assert.deepEqual(await a.page.locator('.shaping-list [data-row-id]').evaluateAll(rows => rows.map(row => row.dataset.rowId === 'landing' ? 'landing' : 'card')),
    ['landing', 'card', 'card'], 'the gap opens before Context');
  const columnLeft = async locator => Math.round((await locator.locator('.card-tab').boundingBox()).x);
  assert.ok(Math.abs(await columnLeft(moving) - await columnLeft(card('Context'))) <= 6, 'the module keeps to the card column (tilted as a dragged card)');
  await waitFor(async () => (await card('Context').boundingBox()).y > contextCard.y + 20, 'Context makes room');
  await a.page.locator('.shaping-list').screenshot({ path: 'artifacts/v0.6.3-drag-in.png' });
  await a.page.mouse.move(textModule.x + textModule.width / 2, textModule.y + textModule.height / 2, { steps: 10 });
  await a.page.locator('.module-window[data-over]').waitFor();
  assert.equal(await landingCard.count(), 0, 'no gap over the window');
  await moving.waitFor();
  await a.page.mouse.up();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(await types(), ['main-key', 'context', 'german'], 'a module dropped back on the window is not added');
  assert.equal(await a.page.locator('.landing-row').count(), 0);

  // Drag Text from the window onto the upper half of the Context card: it lands before it. From the
  // drop until the card arrives, it stays one element in one place, built like the card (0.6.3).
  await openFamily(windowModule(a.page, 'text'));
  const source = await windowModule(a.page, 'text').boundingBox();
  await a.page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2 + 10, { steps: 4 });
  const target = await card('Context').boundingBox();
  await a.page.mouse.move(target.x + target.width / 2, target.y + target.height / 4, { steps: 10 });
  await landingCard.waitFor({ state: 'attached' });
  // While dragged, the module is marked in the window and the dragged card carries a focus ring (0.6.3).
  assert.equal(await a.page.locator('.window-module[data-type="text"]').getAttribute('data-dragging'), 'true');
  assert.equal(await moving.locator('.card-tab').evaluate(node => getComputedStyle(node).outlineStyle), 'solid', 'the dragged card is marked');
  await a.page.locator('.shaping-list').evaluate(list => Promise.all(list.getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  await a.page.evaluate(() => { window.incoming = document.querySelector('.landing-row'); });
  await a.page.mouse.up();
  assert.equal(await a.page.evaluate(() => document.querySelector('.landing-row[data-saving]') === window.incoming), true, 'the dropped module fills its gap');
  // It glides into the gap, then stays there until the card arrives in the same place.
  await a.page.evaluate(() => new Promise(resolve => setTimeout(resolve, 320))).then(() => a.page.evaluate(() => {
    window.track = [];
    const sample = () => {
      const node = document.querySelector('.shaping-list article.component[data-type="text"] .card-tab');
      if (node) window.track.push(Math.round(node.getBoundingClientRect().y));
      if (window.track.length < 200) requestAnimationFrame(sample);
    };
    sample();
  }));
  await waitFor(async () => (await types()).includes('text'), 'Text dragged onto the page');
  await card('Text').waitFor();
  await waitFor(() => a.page.evaluate(() => window.track.length >= 200), 'arrival tracked', 8000);
  const track = await a.page.evaluate(() => window.track);
  assert.ok(Math.max(...track) - Math.min(...track) <= 3, `the module stays in place from drop to arrival (${Math.min(...track)}–${Math.max(...track)})`);
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german']);
  assert.deepEqual((await store.deck((await store.page(pageId)).deckId)).modules.map(module => module.type),
    ['main-key', 'context', 'german'], 'the deck is unchanged');

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
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  const from = await cardTab(a.page, 'Text').boundingBox(), end = await a.page.locator('.drop-end').boundingBox();
  await a.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 4 });
  await a.page.mouse.move(end.x + end.width / 2 + 120, end.y + end.height / 2, { steps: 12 });
  const shiftOf = heading => rowOf(heading).evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m42);
  await waitFor(async () => await shiftOf('German') < -20 && await shiftOf('Context') < -20, 'every card after it makes room');
  assert.equal(await rowOf('Text').evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m41), 0, 'the card stays in its column');
  // Every frame after the drop, each card only moves on toward its place, never back (no flicker).
  await a.page.evaluate(() => {
    window.settling = [];
    const sample = () => {
      window.settling.push(Object.fromEntries([...document.querySelectorAll('.shaping-list .sortable-row')]
        .map(row => [row.querySelector('h2')?.textContent, row.firstElementChild.getBoundingClientRect().y])));
      if (window.settling.length < 45) requestAnimationFrame(sample);
    };
    sample();
  });
  await a.page.mouse.up();
  await waitFor(() => a.page.evaluate(() => window.settling.length >= 45), 'drop settled');
  const settling = await a.page.evaluate(() => window.settling);
  for (const heading of ['Context', 'German', 'Text']) {
    const steps = settling.map(frame => frame[heading]).filter(y => y !== undefined).map((y, index, all) => index ? y - all[index - 1] : 0);
    assert.ok(!(steps.some(step => step > 2) && steps.some(step => step < -2)), `${heading} settles without jumping back (${steps.map(Math.round)})`);
  }
  await waitFor(() => heldMoves.length === 1, 'move request reached the server');
  for (let sample = 0; sample < 5; sample++) {
    assert.deepEqual(await headings(), ['Main key', 'Context', 'German', 'Text'], 'the new order shows before the save finishes');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german'], 'the move is still held');
  holdMoves = false; heldMoves.shift()();
  await waitFor(async () => (await types()).at(-1) === 'text', 'Text dragged to the end');
  assert.deepEqual(await types(), ['main-key', 'context', 'german', 'text']);
  assert.deepEqual(await headings(), ['Main key', 'Context', 'German', 'Text']);

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
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german']);
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
  await openFamily(windowModule(a.page, 'chinese'));
  await a.page.keyboard.press('Space');
  // The window's + adds a module as the last component, without dragging (0.6.3), even when
  // pressed right after another add: the server appends it after whatever the page holds.
  await a.page.locator('.window-module[data-type="chinese"]').getByRole('button', { name: 'Add Chinese at the end', exact: true }).click();
  await waitFor(async () => (await types()).length === 6, 'Text and Chinese added');
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german', 'text', 'chinese']);
  await card('Chinese').waitFor();

  // Deck settings take a dragged module too, and the main key stays first.
  const deckId = (await store.page(pageId)).deckId;
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  // Wait for the configuration itself, not only the page shell, before dragging.
  await a.page.locator('.deck-module[data-type="german"]').waitFor();
  await drag(a.page, windowModule(a.page, 'chinese'), a.page.locator('.drop-end'));
  await a.page.locator('.deck-module').filter({ hasText: 'Chinese' }).waitFor();
  // The + works in deck settings too: the module goes last in the list.
  await openFamily(windowModule(a.page, 'chinese'));
  await a.page.locator('.window-module[data-type="chinese"]').getByRole('button', { name: 'Add Chinese at the end', exact: true }).click();
  await waitFor(async () => await a.page.locator('.shaping-list .deck-module').last().getAttribute('data-type') === 'chinese', 'Chinese added last');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.deepEqual((await store.deck(deckId)).modules.map(module => module.type), ['main-key', 'context', 'german', 'chinese', 'chinese']);
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german', 'text', 'chinese'], 'the page keeps its own modules');
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
      generate: ({ selectedText, module }, signal) => {
        calls.set(selectedText, (calls.get(selectedText) ?? 0) + 1);
        // Only the German parent is held; the Chinese one, first on the page, completes at once.
        if ((!selectedText.startsWith('hold-') && selectedText !== 'publication acknowledgment') || module.type !== 'german') return Promise.resolve(wordResult(`Generated: ${selectedText}`));
        return new Promise((resolve, reject) => {
          held.set(selectedText, () => resolve(wordResult(`Generated: ${selectedText}`)));
          signal.addEventListener('abort', () => { canceled.add(selectedText); reject(Error('aborted')); }, { once: true });
        });
      }
    }
  });
  await useModules(application.store, ['chinese', 'german']);
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
  assert.equal((await application.store.pages()).length, 1);
  assert.equal(calls.get('uncertain capture'), modulesOf(captured).length, 'one call per parent, none again for the replayed capture');
  assert.deepEqual(modulesOf(await application.store.page(captured.id)).map(item => item.attemptId), attempts);

  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${captured.id}`);
  // The main key's text, as structured parent content is edited through its fields (D09).
  await a.page.getByRole('button', { name: 'Edit Main key', exact: true }).click();
  await a.page.getByRole('textbox', { name: 'Edit Main key', exact: true }).fill('save with lost acknowledgment');
  await loseNextAcknowledgment(a.worker, '/api/page/save');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  const front = captured.components[0];
  const mainKeyText = async () => text((await application.store.page(captured.id)).components[0]);
  await waitFor(async () => await mainKeyText() === 'save with lost acknowledgment', 'original component save committed');
  await application.store.savePage('later-remote-edit', { pageId: captured.id, changes: [{ componentId: front.id, content: textBlocks('later remote edit') }] });
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await a.page.locator('.component-tools').waitFor({ state: 'detached' });
  assert.equal(await mainKeyText(), 'later remote edit');
  assert.equal(calls.get('uncertain capture'), modulesOf(captured).length);

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
  const published = (await application.store.page(publishedAttempt.page_id)).components.find(item => item.id === publishedAttempt.component_id);
  await application.store.savePage('later-than-publication', { pageId: publishedAttempt.page_id, changes: [{ componentId: publishedAttempt.component_id,
    content: fieldEdit(published, 'manual text after publication') }] });
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
      async generate(request) { return resultFor(request, 'Controlled explanation'); }
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
      async generate(request) { return resultFor(request, 'Controlled explanation'); }
    }
  });
  await useModules(application.store, ['chinese', 'german']);
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

test('parents and facets: core only on add, facets only on their own parent, the facet +, waiting and deleted facets, and deck settings', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facets-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facets', epoch: 1 };
  await store.openSession('facets-session', session);
  // A new account's My Deck holds German with all its facets (D08).
  const { pageId } = await store.capture('facets-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = () => store.page(pageId).then(page => page.components.filter(item => item.moduleType === 'german'));
  const [first] = await german();
  assert.deepEqual(first.facets, ['article', 'examples', 'synonyms', 'antonyms']);
  const attempt = await store.attempt(first.attemptId);
  await store.establishInterpretation(attempt.run_id, { inputType: 'word_phrase' });
  await store.stage(first.attemptId, staged(BANK));
  await store.publish('facets-publish', { attemptId: first.attemptId, session });
  const card = name => componentArticle(a.page, name);
  const facet = (parent, name) => a.page.locator(`.window-facet[data-parent="${parent}"][data-facet="${name}"]`);
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await card('German').locator('.facet').first().waitFor();

  // The core, then each facet under its label, and how the key was read.
  assert.equal(await a.page.locator('.interpretation').textContent(), 'Read as a word');
  assert.deepEqual(await card('German').locator('.facet .facet-tab-label').allTextContents(), ['Article', 'Examples', 'Synonyms', 'Antonyms']);
  assert.equal(await card('German').locator('.entry-core li').textContent(), 'Ufer');

  // A facet goes nowhere without a parent of its type. Why is told to assistive technology only:
  // the window shows no text for it, pointed at or not (0.7.1).
  await openFamily(facet('chinese', 'pinyin'));
  assert.equal(await facet('chinese', 'pinyin').getAttribute('aria-disabled'), 'true');
  await facet('chinese', 'pinyin').hover();
  assert.equal(await facet('chinese', 'pinyin').innerText(), 'Pinyin');
  assert.match(await facet('chinese', 'pinyin').locator('.window-facet-body').getAttribute('aria-label'), /Add a Chinese module first\.$/);

  // Deleting a facet with content asks first; it leaves the content and the module.
  await card('German').locator('.facet[data-facet="examples"]').hover();
  await a.page.getByRole('button', { name: 'Delete Examples from German', exact: true }).click();
  await a.page.getByRole('button', { name: 'Yes, delete Examples from German', exact: true }).click();
  await waitFor(async () => !(await german())[0].facets.includes('examples'), 'Examples deleted');
  await card('German').locator('.facet[data-facet="examples"]').waitFor({ state: 'detached' });
  assert.doesNotMatch(text((await german())[0]), /Examples/);

  // A parent added from the window has its core only.
  await openFamily(windowModule(a.page, 'chinese'));
  await a.page.getByRole('button', { name: 'Add Chinese at the end', exact: true }).click();
  await card('Chinese').waitFor();
  const chinese = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'chinese');
  await waitFor(async () => Boolean(await chinese()), 'Chinese added');
  assert.deepEqual((await chinese()).facets, []);

  // With one Chinese module, the facet's + adds to it directly.
  await waitFor(async () => await facet('chinese', 'pinyin').getAttribute('aria-disabled') === 'false', 'Pinyin available');
  await a.page.getByRole('button', { name: 'Add Chinese Pinyin', exact: true }).click();
  await waitFor(async () => (await chinese()).facets.includes('pinyin'), 'Pinyin added to Chinese');

  // A German facet dropped on the Chinese card is refused; on the German card it waits for Retry.
  await drag(a.page, facet('german', 'examples').locator('.window-facet-body'), card('Chinese'), { follow: true });
  assert.deepEqual((await chinese()).facets, ['pinyin'], 'a facet lands only on its own parent');
  assert.equal((await german())[0].facets.includes('examples'), false);
  await drag(a.page, facet('german', 'examples').locator('.window-facet-body'), card('German'), { follow: true });
  await waitFor(async () => (await german())[0].facets.includes('examples'), 'Examples added back');
  assert.deepEqual((await german())[0].facets, ['article', 'examples', 'synonyms', 'antonyms'], 'in the parent’s order');
  // A re-added facet waits as its tag only, in its slot (0.7.4): no section on the card.
  await waitFor(async () => await card('German').locator('.facet-tag[data-facet="examples"][data-unfilled]').count() === 1, 'its bland tag');
  assert.equal(await card('German').locator('.facet[data-facet="examples"]').count(), 0, 'no section while it waits');
  assert.deepEqual(await card('German').locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)),
    ['article', 'synonyms', 'antonyms']);
  assert.deepEqual(await card('German').locator('.facet-tag .facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  await a.page.screenshot({ path: 'artifacts/v0.7.0-facets-page.png', fullPage: true });

  // With two German modules that lack a facet, its + picks it up and each German wears its ghost (0.7.2).
  await card('German').locator('.facet[data-facet="synonyms"]').hover();
  await a.page.getByRole('button', { name: 'Delete Synonyms from German', exact: true }).click();
  await a.page.getByRole('button', { name: 'Yes, delete Synonyms from German', exact: true }).click();
  await waitFor(async () => !(await german())[0].facets.includes('synonyms'), 'Synonyms deleted');
  await a.page.getByRole('button', { name: 'Add German at the end', exact: true }).click();
  await waitFor(async () => (await german()).length === 2, 'second German added');
  // Two Germans on one page are numbered in their tabs, in the page's order (0.7.2).
  await card('German 2').waitFor();
  assert.deepEqual(await a.page.locator('.component[data-type="german"] .tab-label').allTextContents(), ['German 1', 'German 2']);
  const plus = a.page.getByRole('button', { name: 'Add German Synonyms', exact: true });
  const ghosts = a.page.locator('.facet-tag[data-ghost]');
  await plus.click();
  await waitFor(async () => await ghosts.count() === 2, 'a ghost on each German');
  assert.equal(await plus.getAttribute('aria-pressed'), 'true');
  assert.equal(await facet('german', 'synonyms').getAttribute('data-picked'), 'true');
  assert.equal(await card('Chinese').locator('.facet-tag[data-ghost]').count(), 0, 'no ghost on the Chinese card');
  assert.deepEqual(await a.page.locator('.facet-ghost').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))),
    ['Add Synonyms to German 1', 'Add Synonyms to German 2']);
  // The ghost stands in the slot the tag would take, among the tags, in the parent's order.
  assert.deepEqual(await card('German 1').locator('.facet-tag .facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  await new Promise(resolve => setTimeout(resolve, 900)); // the tags make room, and the ghosts pop in
  // Held at the glow's peak for the picture, then let go again in phase.
  // At rest, every tag on the unfolded card, the ghost included, has its mark at the same place
  // within it: centred in the bookmark's body beside the notch.
  await a.page.locator('.shaping-list').evaluate(node => { const animation = node.getAnimations().find(each => each.animationName === 'glow-beat'); animation.pause(); animation.currentTime = 0; });
  const marks = await card('German 1').locator('.facet-tag').evaluateAll(tags => tags.map(tag => {
    const box = tag.getBoundingClientRect(), mark = tag.querySelector('.facet-tag-mark').getBoundingClientRect();
    return { facet: tag.dataset.facet, x: mark.left + mark.width / 2 - box.left, y: mark.top + mark.height / 2 - box.top };
  }));
  assert.equal(marks.length, 4);
  for (const each of marks) {
    assert.ok(Math.abs(each.x - 18.6) <= 1 && Math.abs(each.y - 12) <= 1, `${each.facet}'s mark is centred in the body (${each.x}, ${each.y})`);
  }
  await a.page.locator('.shaping-list').evaluate(node => { node.getAnimations().find(each => each.animationName === 'glow-beat').currentTime = 800; });
  await a.page.screenshot({ path: 'artifacts/v0.7.2-ghost-tags.png', fullPage: true });
  await a.page.locator('.shaping-list').evaluate(node => node.getAnimations().find(each => each.animationName === 'glow-beat').play());
  // The + again, or a click elsewhere, puts it back and adds nothing.
  await plus.click();
  await waitFor(async () => await ghosts.count() === 0, 'the + again puts it back');
  assert.equal(await plus.getAttribute('aria-pressed'), 'false');
  await plus.click();
  await waitFor(async () => await ghosts.count() === 2, 'picked up again');
  await a.page.locator('.page-header').click();
  await waitFor(async () => await ghosts.count() === 0, 'a click elsewhere puts it back');
  // The cards are not outlined; their tabs glow, and only a tab or a ghost takes the click:
  // a click on the rest of a card puts the facet back.
  await plus.click();
  await waitFor(async () => await ghosts.count() === 2, 'picked up again');
  assert.equal(await card('German 1').evaluate(node => getComputedStyle(node).outlineStyle), 'none', 'the cards are not outlined');
  // Every tab and ghost glows on one beat: the list breathes one value, and each glow is drawn from it.
  const list = a.page.locator('.shaping-list');
  assert.equal(await list.evaluate(node => getComputedStyle(node).animationName), 'glow-beat');
  for (let sample = 0; sample < 3; sample++) {
    const levels = await a.page.evaluate(() => [...document.querySelectorAll('.sortable-row[data-ghost-target] .card-tab, .facet-tag[data-ghost]')]
      .map(node => getComputedStyle(node).getPropertyValue('--glow-level')));
    assert.equal(levels.length, 4, 'two tabs and two ghosts glow');
    assert.equal(new Set(levels).size, 1, `in phase (${levels})`);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.notEqual(await card('German 1').locator('.card-tab').evaluate(node => getComputedStyle(node).boxShadow), 'none', 'the tab glows');
  await card('German 1').locator('.card-fold').click();
  await waitFor(async () => await ghosts.count() === 0, 'a click on the card’s content puts it back');
  assert.deepEqual((await german()).map(item => item.facets.includes('synonyms')), [false, false], 'putting it back adds nothing');
  // A click on the second German's tab places it there, and there only: its tag flies in from the window.
  await a.page.evaluate(() => {
    window.tagMotions = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.classList?.contains('facet-tag')) window.tagMotions.push({ facet: this.dataset.facet, keyframes: keyframes.map(frame => frame.transform ?? null) });
      return original.call(this, keyframes, options);
    };
  });
  await plus.click();
  await waitFor(async () => await ghosts.count() === 2, 'picked up once more');
  await card('German 2').locator('.card-tab').click();
  await waitFor(async () => (await german())[1].facets.includes('synonyms'), 'Synonyms added to the second German');
  assert.equal((await german())[0].facets.includes('synonyms'), false);
  await waitFor(async () => await ghosts.count() === 0, 'the tag takes the ghost’s place');
  assert.deepEqual(await card('German 2').locator('.facet-tag .facet-tag-mark').allTextContents(), ['Sy']);
  const flight = (await a.page.evaluate(() => window.tagMotions)).filter(each => each.facet === 'synonyms' && each.keyframes.length === 3).at(-1);
  assert.ok(flight, 'the placed tag flies in');
  const [, dx] = flight.keyframes[0].match(/^translate\((-?[\d.]+)px/);
  assert.ok(Number(dx) > 300, `from the window, to the right (${flight.keyframes[0]})`);

  // Deck settings: a parent hangs its facets' tags below its tab, which can be removed; new pages copy them.
  const deckId = (await store.page(pageId)).deckId;
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  const row = a.page.locator('.deck-module[data-type="german"]');
  await row.locator('.facet-tag').first().waitFor();
  assert.equal(await row.locator('.facet-tags').getAttribute('data-layout'), 'hanging');
  assert.deepEqual(await row.locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  await row.locator('.facet-tag[data-facet="antonyms"]').hover();
  await row.getByRole('button', { name: 'Remove Antonyms from German', exact: true }).click();
  await waitFor(async () => await row.locator('.facet-tag').count() === 3, 'the Antonyms tag popped');
  await a.page.getByRole('button', { name: 'Preview', exact: true }).click();
  assert.deepEqual(await a.page.locator('.preview-dialog .component[data-type="german"] .facet-tab-label').allTextContents(), ['Article', 'Examples', 'Synonyms']);
  await a.page.getByRole('button', { name: 'Close preview', exact: true }).click();
  // With two Germans in deck settings, a facet's + hangs a ghost below each tab; clicking one places it (0.7.2).
  await a.page.getByRole('button', { name: 'Add German at the end', exact: true }).click();
  const deckGermans = a.page.locator('.deck-module[data-type="german"]');
  await deckGermans.nth(1).waitFor();
  await a.page.getByRole('button', { name: 'Add German Antonyms', exact: true }).click();
  const deckGhosts = deckGermans.locator('.facet-tag[data-ghost]');
  await waitFor(async () => await deckGhosts.count() === 2, 'a ghost below each German tab');
  assert.equal(await deckGermans.nth(1).locator('.facet-tags').getAttribute('data-layout'), 'hanging');
  // The ghost swells with its glow, never still: click it without waiting for it to settle.
  await a.page.getByRole('button', { name: 'Add Antonyms to German 2', exact: true }).click({ force: true });
  await waitFor(async () => await deckGhosts.count() === 0, 'placed');
  assert.deepEqual(await deckGermans.nth(1).locator('.facet-tag-mark').allTextContents(), ['An']);
  assert.deepEqual(await deckGermans.nth(0).locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy']);
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(async () => (await store.deck(deckId)).modules.find(module => module.type === 'german').facets.length === 3, 'deck facets saved');
  assert.deepEqual((await store.deck(deckId)).modules.find(module => module.type === 'german').facets, ['article', 'examples', 'synonyms']);
});

test('facets from the keyboard: Space picks a facet up, the arrows step only through its own parents, Escape cancels, and the + with ghost tags', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-keys-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facet-keys', epoch: 1 };
  await store.openSession('facet-keys-session', session);
  const { pageId } = await store.capture('facet-keys-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = () => store.page(pageId).then(page => page.components.filter(item => item.moduleType === 'german'));
  const chinese = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'chinese');
  const [first] = await german();
  const attempt = await store.attempt(first.attemptId);
  await store.establishInterpretation(attempt.run_id, { inputType: 'word_phrase' });
  await store.stage(first.attemptId, staged(BANK));
  await store.publish('facet-keys-publish', { attemptId: first.attemptId, session });
  const card = name => componentArticle(a.page, name);
  const facet = (parent, name) => a.page.locator(`.window-facet[data-parent="${parent}"][data-facet="${name}"]`);
  // dnd-kit's live region holds only its latest announcement; keep every one.
  // The place a keyboard drag starts over is announced with the pickup.
  const heard = () => a.page.evaluate(() => window.announcements);
  // Presses a key and waits for what it announces; with `said`, a later announcement holding it.
  async function press(key, said) {
    const before = (await heard()).length;
    await a.page.keyboard.press(key);
    if (!said) return;
    await waitFor(async () => (await heard()).slice(before).some(each => each.includes(said)), `${key} announced “${said}”`)
      .catch(async error => { throw new Error(`${error.message}; heard ${JSON.stringify(await heard())}`); });
  }
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await card('German').locator('.facet').first().waitFor();
  await a.page.evaluate(() => {
    window.announcements = [];
    new MutationObserver(() => {
      const region = document.querySelector('[id^="DndLiveRegion"]');
      const said = region?.textContent.trim();
      if (said && said !== window.announcements.at(-1)) window.announcements.push(said);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  // German, Chinese, German: the first German lacks Examples and Synonyms, the second has its core only.
  for (const name of ['Examples', 'Synonyms']) {
    await card('German').locator(`.facet[data-facet="${name.toLowerCase()}"]`).hover();
    await a.page.getByRole('button', { name: `Delete ${name} from German`, exact: true }).click();
    await a.page.getByRole('button', { name: `Yes, delete ${name} from German`, exact: true }).click();
    await waitFor(async () => !(await german())[0].facets.includes(name.toLowerCase()), `${name} deleted`);
  }
  await openFamily(windowModule(a.page, 'chinese'));
  await a.page.getByRole('button', { name: 'Add Chinese at the end', exact: true }).click();
  await waitFor(async () => Boolean(await chinese()), 'Chinese added');
  await openFamily(windowModule(a.page, 'german'));
  await a.page.getByRole('button', { name: 'Add German at the end', exact: true }).click();
  await waitFor(async () => (await german()).length === 2, 'second German added');
  const [firstId, secondId] = (await german()).map(item => item.id);
  const target = id => a.page.locator(`.sortable-row[data-row-id="${id}"]`);
  const chineseRow = async () => target((await chinese()).id);
  // Wait for the entries themselves: until the account refresh brings an added module, a landing
  // card holds its place, and a facet picked up then would not count it among its targets.
  for (const id of [firstId, (await chinese()).id, secondId]) await target(id).waitFor();

  // Space picks a facet up where it would land first; only the German cards are marked
  // as places it would go. Escape cancels the drag and adds nothing.
  const examples = facet('german', 'examples').locator('.window-facet-body');
  await openFamily(examples);
  await waitFor(async () => await facet('german', 'examples').getAttribute('aria-disabled') === 'false', 'Examples available');
  await examples.focus();
  await press('Space', 'Picked up German Examples. German Examples is over German');
  await waitFor(async () => await target(firstId).getAttribute('data-facet-target') && await target(secondId).getAttribute('data-facet-target'), 'German cards marked');
  assert.equal(await (await chineseRow()).getAttribute('data-facet-target'), null, 'the Chinese card would not take a German facet');
  // The sensor needs a moment after pickup before it moves.
  await new Promise(resolve => setTimeout(resolve, 300));
  await press('ArrowUp');
  await press('ArrowUp');
  await waitFor(async () => await target(firstId).getAttribute('data-facet-target') === 'over', 'over the first German');
  await press('Escape', 'Moving German Examples was cancelled.');
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual((await german()).map(item => item.facets.includes('examples')), [false, false], 'a cancelled facet drag adds nothing');
  assert.equal(await a.page.locator('[data-facet-target]').count(), 0, 'the marks go with the drag');

  // Picked up again: the arrows step from the first German over the Chinese card to the
  // second and stop there; Space drops the facet onto the second German.
  await examples.focus();
  await press('Space', 'Picked up German Examples.');
  await new Promise(resolve => setTimeout(resolve, 300));
  await press('ArrowUp');
  await press('ArrowUp');
  await waitFor(async () => await target(firstId).getAttribute('data-facet-target') === 'over', 'over the first German');
  await press('ArrowDown', 'German Examples is over German 2.');
  assert.equal(await target(secondId).getAttribute('data-facet-target'), 'over', 'ArrowDown steps over the Chinese card');
  assert.equal(await target(firstId).getAttribute('data-facet-target'), 'target');
  assert.equal(await (await chineseRow()).getAttribute('data-facet-target'), null);
  await press('ArrowDown');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await target(secondId).getAttribute('data-facet-target'), 'over', 'the last German is as far as it goes');
  await press('Space', 'German Examples was added to German 2.');
  const said = await heard();
  assert.ok(said.some(each => each.includes('German Examples is over German 1.')), `the first German was announced (${said})`);
  assert.ok(!said.some(each => /Chinese|not over/.test(each)), `only German cards were announced (${said})`);
  await waitFor(async () => (await german())[1].facets.includes('examples'), 'Examples added to the second German');
  assert.equal((await german())[0].facets.includes('examples'), false, 'only the chosen German takes it');
  assert.deepEqual((await chinese()).facets, []);

  // The facet's + from the keyboard (0.7.2): Enter picks it up and moves the focus to the first
  // ghost; Tab and Shift+Tab move between the ghosts only; Escape puts it back and returns to +;
  // Enter on a ghost places it there.
  const plus = a.page.getByRole('button', { name: 'Add German Synonyms', exact: true });
  const ghost = n => a.page.getByRole('button', { name: `Add Synonyms to German ${n}`, exact: true });
  const focused = locator => locator.evaluate(node => node === document.activeElement);
  await plus.focus();
  await a.page.keyboard.press('Enter');
  await waitFor(() => focused(ghost(1)), 'focus on the first ghost');
  assert.equal(await a.page.locator('.facet-ghost').count(), 2);
  assert.equal(await (await chineseRow()).locator('.facet-ghost').count(), 0);
  await a.page.keyboard.press('Tab');
  assert.equal(await focused(ghost(2)), true, 'Tab moves to the second ghost');
  await a.page.keyboard.press('Tab');
  assert.equal(await focused(ghost(1)), true, 'and round to the first');
  await a.page.keyboard.press('Shift+Tab');
  assert.equal(await focused(ghost(2)), true, 'Shift+Tab moves back');
  await a.page.keyboard.press('Escape');
  await waitFor(async () => await a.page.locator('.facet-ghost').count() === 0, 'Escape puts it back');
  assert.equal(await focused(plus), true, 'Escape returns focus to the +');
  assert.deepEqual((await german()).map(item => item.facets.includes('synonyms')), [false, false], 'putting it back adds nothing');
  await a.page.keyboard.press('Enter');
  await waitFor(() => focused(ghost(1)), 'picked up again');
  await a.page.keyboard.press('Tab');
  await a.page.keyboard.press('Enter');
  await waitFor(async () => (await german())[1].facets.includes('synonyms'), 'Synonyms added to the second German');
  assert.equal((await german())[0].facets.includes('synonyms'), false);
});

test('facet tags: abbreviations in order, on the left edge, along the edge to the bottom right when folded and back, flown in from the window, popped when deleted, and hung from the tab in deck settings', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-tags-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facet-tags', epoch: 1 };
  await store.openSession('facet-tags-session', session);
  const { pageId } = await store.capture('facet-tags-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = () => store.page(pageId).then(page => page.components.find(item => item.moduleType === 'german'));
  const first = await german();
  const attempt = await store.attempt(first.attemptId);
  await store.establishInterpretation(attempt.run_id, { inputType: 'word_phrase' });
  await store.stage(first.attemptId, staged(BANK));
  await store.publish('facet-tags-publish', { attemptId: first.attemptId, session });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  const tags = card.locator('.facet-tags');
  await card.locator('.facet').first().waitFor();
  // Every animation a tag starts, as its keyframes, recorded as it starts.
  await a.page.evaluate(() => {
    window.tagMotions = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.classList?.contains('facet-tag')) window.tagMotions.push({ facet: this.dataset.facet, keyframes: keyframes.map(frame => frame.transform ?? null) });
      return original.call(this, keyframes, options);
    };
  });
  const motions = async facet => (await a.page.evaluate(() => window.tagMotions)).filter(each => each.facet === facet);
  // A move along the card's edge: from the start, every point keeps to one side or the other
  // (within the rounded turn) and the move ends in place.
  const points = motion => motion.keyframes.map(frame => frame.match(/^translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)$/).slice(1).map(Number));
  const keepsTo = (motion, onFirstSide, onSecondSide) => {
    const path = points(motion);
    const [x0, y0] = path[0];
    return path.length > 3 && path.every(([x, y]) => onFirstSide(x, y, x0, y0) || onSecondSide(x, y, x0, y0)) && path.at(-1).every(value => Math.abs(value) < .5);
  };
  const settle = () => card.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  const geometry = () => card.evaluate(node => {
    const box = node.getBoundingClientRect();
    return [...node.querySelectorAll('.facet-tag:not([data-leaving])')].map(tag => {
      const rect = tag.getBoundingClientRect();
      return { left: rect.left - box.left, right: rect.right - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top, width: box.width, height: box.height };
    });
  });

  // One tag per facet, marked with its abbreviation, in the parent's order, stuck out of the card's left edge.
  assert.equal(await tags.getAttribute('data-layout'), 'edge');
  assert.deepEqual(await tags.locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  const edge = await geometry();
  assert.ok(edge.every(tag => tag.right <= 2 && tag.right >= -2), `tags stand against the left edge (${JSON.stringify(edge)})`);
  assert.ok(edge.every((tag, index) => !index || tag.top > edge[index - 1].top), 'one under another, in order');
  await a.page.screenshot({ path: 'artifacts/v0.7.1-facet-tags-edge.png' });

  // Folded, the tags move down the left side and then along the bottom to its right.
  await (await cardButton(a.page, 'Fold German')).click();
  await waitFor(async () => await tags.getAttribute('data-layout') === 'folded', 'tags folded');
  const down = (await motions('article')).at(-1);
  assert.ok(keepsTo(down, (x, y, x0) => Math.abs(x - x0) <= 15, (x, y) => Math.abs(y) <= 15),
    `down the left side, round the corner, along the bottom (${down.keyframes})`);
  // The card folds only once its tags have travelled: the last one sets out 3 × 40ms after the first.
  assert.equal(await card.locator('.card-fold').evaluate(node => getComputedStyle(node).transitionDelay), '0.72s');
  // The card's padding and height fold with it rather than jumping (a row's own transitions once replaced them).
  const folds = (await card.evaluate(node => getComputedStyle(node).transitionProperty)).split(', ');
  assert.ok(['padding', 'margin', 'min-height'].every(property => folds.includes(property)), `the card's fold transitions stay (${folds})`);
  await settle();
  const bottom = await geometry();
  assert.ok(bottom.every(tag => tag.top >= tag.height - 8 && tag.top <= tag.height && tag.bottom > tag.height), `the tags hang from the folded card's bottom edge (${JSON.stringify(bottom)})`);
  assert.ok(bottom.every(tag => tag.right <= tag.width && tag.left > tag.width / 2), 'at its right');
  assert.ok(bottom.every((tag, index) => !index || tag.left > bottom[index - 1].left), 'in order, left to right');
  await a.page.screenshot({ path: 'artifacts/v0.7.1-facet-tags-folded.png' });

  // A folded card's tags are no buttons (0.7.4); unfolded, the tags go back the same way.
  assert.equal(await tags.getByRole('button', { name: /^Synonyms/ }).count(), 0);
  await (await cardButton(a.page, 'Unfold German')).click();
  // The card opens first, with the tags waiting on its bottom edge; then they travel back.
  assert.equal(await tags.getAttribute('data-layout'), 'folded', 'the tags wait while the card opens');
  await waitFor(async () => await tags.getAttribute('data-layout') === 'edge', 'tags back on the edge');
  const up = (await motions('article')).at(-1);
  assert.ok(keepsTo(up, (x, y, x0, y0) => Math.abs(y - y0) <= 15, x => Math.abs(x) <= 15),
    `along the bottom, round the corner, up the left side (${up.keyframes})`);
  const [, startY] = points(up)[0];
  assert.ok(startY > 100, `they set out from the opened card's bottom edge (${startY}px below their place)`);

  // Removing a tag whose facet has content asks in its section; deleted, the tag pops.
  await card.locator('.facet-tag[data-facet="antonyms"]').hover();
  await a.page.getByRole('button', { name: 'Remove Antonyms from German', exact: true }).click();
  await a.page.getByRole('button', { name: 'Yes, delete Antonyms from German', exact: true }).click();
  await card.locator('.facet-tag[data-facet="antonyms"][data-leaving]').waitFor();
  await card.locator('.facet-tag[data-facet="antonyms"]').waitFor({ state: 'detached' });
  assert.deepEqual((await german()).facets, ['article', 'examples', 'synonyms']);

  // Added again with its +, the tag flies in from the window to its place in the parent's order.
  await openFamily(a.page.locator('.window-facet[data-parent="german"][data-facet="antonyms"]'));
  await a.page.getByRole('button', { name: 'Add German Antonyms', exact: true }).click();
  await card.locator('.facet-tag[data-facet="antonyms"]').waitFor();
  const flight = (await motions('antonyms')).at(-1);
  assert.equal(flight.keyframes.length, 3, 'an arc from the window');
  const [, dx] = flight.keyframes[0].match(/^translate\((-?[\d.]+)px/);
  assert.ok(Number(dx) > 300, `it starts out in the window, to the right (${flight.keyframes[0]})`);
  assert.deepEqual(await tags.locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  // A tag whose facet waits for Retry goes at once.
  await card.locator('.facet-tag[data-facet="antonyms"]').hover();
  await a.page.getByRole('button', { name: 'Remove Antonyms from German', exact: true }).click();
  await waitFor(async () => !(await german()).facets.includes('antonyms'), 'waiting Antonyms deleted without asking');

  // Under reduced motion the tags stand in their places without moving.
  await a.page.emulateMedia({ reducedMotion: 'reduce' });
  const before = (await a.page.evaluate(() => window.tagMotions)).length;
  await (await cardButton(a.page, 'Fold German')).click();
  await waitFor(async () => await tags.getAttribute('data-layout') === 'folded', 'tags folded at once');
  assert.equal((await a.page.evaluate(() => window.tagMotions)).length, before, 'no tag moved');
  await a.page.emulateMedia({ reducedMotion: 'no-preference' });

  // Deck settings: every module is an empty card, its facets hung below the tab on chains.
  const deckId = (await store.page(pageId)).deckId;
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  const row = a.page.locator('.deck-module[data-type="german"]');
  await row.locator('.facet-tag').first().waitFor();
  assert.equal(await row.getAttribute('data-empty'), 'true');
  assert.equal(await row.locator('.facet-tags').getAttribute('data-layout'), 'hanging');
  const hung = await row.evaluate(node => {
    const tab = node.querySelector('.card-tab').getBoundingClientRect();
    return [...node.querySelectorAll('.facet-tag')].map(tag => ({ top: tag.getBoundingClientRect().top - tab.bottom, chain: getComputedStyle(tag, '::after').opacity }));
  });
  assert.ok(hung.every(tag => tag.top > 4 && tag.top < 20 && tag.chain === '1'), `below the tab, each on its chain (${JSON.stringify(hung)})`);
  // The chains hang from a rail that reaches the last one, however many there are.
  const rail = await row.evaluate(node => {
    const list = node.querySelector('.facet-tags'), box = list.getBoundingClientRect(), last = [...node.querySelectorAll('.facet-tag')].at(-1).getBoundingClientRect();
    const style = getComputedStyle(list, '::before');
    return { right: box.left + parseFloat(style.left) + parseFloat(style.width), chain: last.left + last.width / 2 };
  });
  assert.ok(rail.right >= rail.chain, `the rail reaches the last chain (${JSON.stringify(rail)})`);
  await a.page.screenshot({ path: 'artifacts/v0.7.1-facet-tags-deck-settings.png', fullPage: true });
  // Removed there, a tag pops; dragged back onto the module, it flies from where it was let go.
  await row.locator('.facet-tag[data-facet="antonyms"]').hover();
  await row.getByRole('button', { name: 'Remove Antonyms from German', exact: true }).click();
  await row.locator('.facet-tag[data-facet="antonyms"][data-leaving]').waitFor();
  await row.locator('.facet-tag[data-facet="antonyms"]').waitFor({ state: 'detached' });
  await a.page.evaluate(() => {
    window.tagMotions = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.classList?.contains('facet-tag')) window.tagMotions.push({ facet: this.dataset.facet, keyframes: keyframes.map(frame => frame.transform ?? null) });
      return original.call(this, keyframes, options);
    };
  });
  await drag(a.page, a.page.locator('.window-facet[data-parent="german"][data-facet="antonyms"] .window-facet-body'), row, { follow: true });
  await row.locator('.facet-tag[data-facet="antonyms"]').waitFor();
  assert.equal((await motions('antonyms')).at(-1)?.keyframes.length, 3, 'flown in');
  assert.deepEqual(await row.locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  // The last tag pops too, and the tab no longer makes room; a facet added again still flies in.
  for (const name of ['Article', 'Examples', 'Synonyms', 'Antonyms']) {
    await row.locator(`.facet-tag[data-facet="${name.toLowerCase()}"]`).hover();
    await row.getByRole('button', { name: `Remove ${name} from German`, exact: true }).click();
  }
  await row.locator('.facet-tag[data-facet="antonyms"][data-leaving]').waitFor();
  await row.locator('.facet-tag').first().waitFor({ state: 'detached' });
  assert.equal(await row.getAttribute('data-tagged'), null);
  await a.page.getByRole('button', { name: 'Add German Article', exact: true }).click();
  await row.locator('.facet-tag[data-facet="article"]').waitFor();
  assert.equal((await motions('article')).at(-1)?.keyframes.length, 3, 'flown in, not moved from where it stood before');
});

test('0.7.3: a facet’s own Retry beside its Delete, a tag’s remove keeping its colours, and hung tags lifting with their tab', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-retry-browser-'));
  const calls = [];
  let release;
  const application = await createTestApplication(t, { provider: {
    interpret: async () => ({ inputType: 'word_phrase' }),
    generate: request => { calls.push(request); return new Promise(resolve => { release = resolve; }); }
  } });
  await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facet-retry', epoch: 1 };
  await store.openSession('facet-retry-session', session);
  const { pageId } = await store.capture('facet-retry-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const first = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  await store.establishInterpretation((await store.attempt(first.attemptId)).run_id, { inputType: 'word_phrase' });
  // Structured content (D09).
  const core = { kind: 'word', language: 'Englisch', key: 'bank', meanings: ['Ufer'] };
  await store.stage(first.attemptId, staged({ core, facets: { article: { singular: 'das Ufer', plural: 'die Ufer' },
    examples: [{ sentence: 'We sat on the bank.', translation: 'Wir saßen am Ufer.' }] } }));
  await store.publish('facet-retry-publish', { attemptId: first.attemptId, session });
  // A second German, empty, with a facet: only its tab, its tag hung below.
  const { componentId: empty } = await store.addModule('facet-retry-empty', { pageId, type: 'german' });
  await store.addFacet('facet-retry-empty-facet', { pageId, componentId: empty, parent: 'german', facet: 'synonyms' });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German 1');
  const examples = card.locator('.facet[data-facet="examples"]');
  await examples.waitFor();

  // Retry sits beside Delete; with content it asks in the row, in the family colour.
  await examples.hover();
  const retry = a.page.getByRole('button', { name: 'Retry Examples from German 1', exact: true });
  assert.deepEqual(await examples.locator('.facet-actions button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['Retry Examples from German 1', 'Delete Examples from German 1']);
  // Asking, the question stands left of its buttons and Cancel lands under the pointer (0.7.3).
  const underPointer = async (button, confirm) => {
    const box = await button.boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await a.page.mouse.move(at.x, at.y); await a.page.mouse.down(); await a.page.mouse.up();
    const row = examples.locator('.facet-confirm');
    assert.equal(await row.getAttribute('data-confirm'), confirm);
    assert.deepEqual(await row.locator(':scope > *').evaluateAll(parts => parts.map(part => part.getAttribute('aria-label') ?? part.textContent)),
      ['Are you sure?', `Yes, ${confirm} Examples from German 1`, 'Keep Examples from German 1']);
    await settleIn(row);
    assert.equal(await a.page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), at),
      'Keep Examples from German 1', `Cancel is under the pointer after ${confirm}`);
    assert.equal(await a.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Keep Examples from German 1');
  };
  const settleIn = locator => locator.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  await underPointer(a.page.getByRole('button', { name: 'Delete Examples from German 1', exact: true }), 'delete');
  await a.page.getByRole('button', { name: 'Keep Examples from German 1', exact: true }).click();
  await examples.hover();
  await underPointer(retry, 'retry');
  await examples.locator('.facet-confirm').screenshot({ path: 'artifacts/v0.7.3-facet-confirm.png' });
  await a.page.getByRole('button', { name: 'Yes, retry Examples from German 1', exact: true }).click();

  // While it regenerates the card stays open with the rest of its content.
  // The spark runs round the facet's tab (0.7.4), the only sign that it generates.
  await examples.locator('.facet-tab .spark:not([data-ending])').waitFor();
  assert.equal(await examples.locator('.facet-body').evaluate(node => getComputedStyle(node).animationName), 'none', 'its content no longer fades');
  assert.equal(await card.locator('.facet-tag[data-facet="examples"] .facet-tag-open').evaluate(node => getComputedStyle(node).animationName), 'none', 'nor its tag breathes');
  assert.equal(await card.getAttribute('data-generating'), null, 'not folded down to its tab');
  assert.match(await card.locator('.facet[data-facet="article"]').textContent(), /das Ufer · die Ufer/);
  assert.match(await examples.textContent(), /We sat on the bank\./);
  await waitFor(() => release, 'facet provider started');
  assert.deepEqual(calls.map(call => [call.facets, call.core]), [[['examples'], core]], 'the provider writes the facet alone for the core');
  release({ facets: { examples: [{ sentence: 'The bank was steep.', translation: 'Das Ufer war steil.' }] } });
  await waitFor(async () => /The bank was steep\./.test(await examples.textContent()), 'new examples shown');
  assert.match(await card.locator('.facet[data-facet="article"]').textContent(), /das Ufer · die Ufer/, 'the other facet stays');
  assert.equal(await examples.locator('.facet-note').count(), 0);
  await a.page.screenshot({ path: 'artifacts/v0.7.3-facet-retry.png' });

  // A tag's remove keeps the failed colour while it is pointed at, on a card and on an empty one.
  for (const holder of [card, componentArticle(a.page, 'German 2')]) {
    const tag = holder.locator('.facet-tag').first();
    const remove = tag.locator('.facet-tag-remove');
    await tag.locator('.facet-tag-open').hover();
    await a.page.waitForTimeout(300);
    const shown = await remove.evaluate(node => getComputedStyle(node).backgroundColor);
    await remove.hover();
    await a.page.waitForTimeout(300);
    assert.equal(await remove.evaluate(node => getComputedStyle(node).backgroundColor), shown, 'the same colour under the pointer');
    assert.equal(shown, await a.page.evaluate(() => {
      const probe = document.body.appendChild(Object.assign(document.createElement('i'), { style: 'background: var(--status-failed)' }));
      const colour = getComputedStyle(probe).backgroundColor; probe.remove(); return colour;
    }), 'the failed colour');
  }

  // Hovering an empty card lifts its tab and what hangs below it together.
  const hung = componentArticle(a.page, 'German 2');
  await a.page.mouse.move(5, 5);
  await a.page.waitForTimeout(400);
  const place = () => hung.evaluate(node => ({ tab: node.querySelector('.card-tab').getBoundingClientRect().top,
    tags: node.querySelector('.facet-tags').getBoundingClientRect().top }));
  const rest = await place();
  await hung.locator('.card-tab').hover();
  await a.page.waitForTimeout(400);
  const lifted = await place();
  assert.ok(Math.abs((rest.tab - lifted.tab) - 2) < .5, `the tab lifts (${rest.tab} → ${lifted.tab})`);
  assert.ok(Math.abs((rest.tags - lifted.tags) - (rest.tab - lifted.tab)) < .5, `the hung tags lift with it (${rest.tags} → ${lifted.tags})`);

  // A facet with nothing in it wears a blander tag; one with content does not.
  const unfilled = holder => holder.locator('.facet-tag').evaluateAll(tags => tags.map(tag => [tag.dataset.facet, tag.hasAttribute('data-unfilled')]));
  assert.deepEqual(await unfilled(card), [['article', false], ['examples', false], ['synonyms', true], ['antonyms', true]]);
  assert.deepEqual(await unfilled(hung), [['synonyms', true]]);
  assert.match(await card.locator('.facet-tag[data-facet="synonyms"]').evaluate(tag => getComputedStyle(tag, '::before').filter), /saturate\(0\.3\)/);
  assert.doesNotMatch(await card.locator('.facet-tag[data-facet="article"]').evaluate(tag => getComputedStyle(tag, '::before').filter), /saturate/);
  // A hung tag is no button; on an open card's edge every tag is one (0.7.4).
  assert.equal(await hung.getByRole('img', { name: 'Synonyms, empty', exact: true }).count(), 1);
  const synonymsTag = card.locator('.facet-tag[data-facet="synonyms"]');
  const tagButton = card.getByRole('button', { name: 'Synonyms, empty in German 1', exact: true });
  const tagRetry = card.getByRole('button', { name: 'Retry Synonyms in German 1', exact: true });
  assert.equal(await tagButton.getAttribute('aria-expanded'), 'false');
  // Clicked, the tag pulls out to its Retry, and nothing scrolls; a short window, so a scroll would show.
  await a.page.setViewportSize({ width: 1280, height: 420 });
  await synonymsTag.scrollIntoViewIfNeeded();
  await a.page.waitForTimeout(300);
  const scrolled = await a.page.evaluate(() => window.scrollY);
  const tucked = await synonymsTag.boundingBox();
  await tagButton.click();
  await settleIn(synonymsTag);
  assert.equal(await tagButton.getAttribute('aria-expanded'), 'true');
  const out = await synonymsTag.boundingBox();
  assert.ok(tucked.x - out.x > 30, `pulled out of the card (${tucked.x} → ${out.x})`);
  const ribbon = await tagRetry.boundingBox();
  const cardLeft = (await card.boundingBox()).x;
  assert.ok(ribbon.x < cardLeft && Math.abs(ribbon.x + ribbon.width - cardLeft) <= 1, `the ribbon reaches from the tag to the card (${JSON.stringify(ribbon)}, ${cardLeft})`);
  assert.equal(await a.page.evaluate(() => window.scrollY), scrolled, 'nothing scrolls');
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  await synonymsTag.scrollIntoViewIfNeeded();
  await a.page.screenshot({ path: 'artifacts/v0.7.4-tag-pulled.png', clip: { x: Math.max(0, out.x - 40), y: Math.max(0, out.y - 120), width: 520, height: 300 } });
  // Escape pushes it back, the focus on the tag; so does a click elsewhere.
  await a.page.keyboard.press('Escape');
  await waitFor(async () => await tagButton.getAttribute('aria-expanded') === 'false', 'pushed back by Escape');
  assert.equal(await a.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Synonyms, empty in German 1');
  await tagButton.click();
  await a.page.mouse.click(700, 30);
  await waitFor(async () => await tagButton.getAttribute('aria-expanded') === 'false', 'pushed back by a click elsewhere');
  // Its Retry asks nothing: the facet generates at once, its tag breathing, into its place.
  await tagButton.click();
  await settleIn(synonymsTag);
  await tagRetry.click();
  assert.equal(await card.locator('.facet-confirm').count(), 0, 'no "Are you sure?"');
  await waitFor(async () => await synonymsTag.getAttribute('data-retrying') !== null, 'Synonyms generating');
  assert.equal(await synonymsTag.getAttribute('data-pulled'), null, 'and goes back in');
  // Generating, the empty facet's section stands in its place, its heading only, the spark round its tab (0.7.4).
  const synonyms = card.locator('.facet[data-facet="synonyms"]');
  await synonyms.locator('.facet-tab .spark').waitFor();
  assert.notEqual(await synonyms.getAttribute('data-pending'), null);
  assert.equal(await synonyms.locator('.facet-body').count(), 0);
  assert.deepEqual(await card.locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)), ['article', 'examples', 'synonyms']);
  await card.screenshot({ path: 'artifacts/v0.7.4-facet-generating.png' });
  await waitFor(() => calls.length === 2, 'facet provider started again');
  assert.deepEqual(calls[1].facets, ['synonyms']);
  release({ facets: { synonyms: ['Böschung'] } });
  await synonyms.locator('.facet-body').waitFor();
  assert.equal(await synonyms.getAttribute('data-pending'), null, 'the block stays, with its content');
  assert.deepEqual(await card.locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)), ['article', 'examples', 'synonyms'],
    'in its place in the parent’s order');
  assert.equal(await synonymsTag.getAttribute('data-unfilled'), null);
  assert.equal(await synonymsTag.getAttribute('data-retrying'), null);
  // A tag with content pulls out the same way, and its Retry also asks nothing.
  await card.getByRole('button', { name: 'Article in German 1', exact: true }).click();
  await card.getByRole('button', { name: 'Retry Article in German 1', exact: true }).click();
  await waitFor(() => calls.length === 3, 'the Article regenerates at once');
  release({ facets: { article: { singular: 'das Ufer', plural: 'die Ufer' } } });
  await waitFor(async () => await card.locator('.facet-tag[data-facet="article"]').getAttribute('data-retrying') === null, 'Article done');
  // An empty facet that comes back empty: its section shows while it generates, then goes again.
  await card.getByRole('button', { name: 'Antonyms, empty in German 1', exact: true }).click();
  await card.getByRole('button', { name: 'Retry Antonyms in German 1', exact: true }).click();
  await card.locator('.facet[data-facet="antonyms"][data-pending]').waitFor();
  await waitFor(() => calls.length === 4, 'Antonyms requested');
  release({ facets: {} });
  await card.locator('.facet[data-facet="antonyms"]').waitFor({ state: 'detached' });
  assert.notEqual(await card.locator('.facet-tag[data-facet="antonyms"]').getAttribute('data-unfilled'), null, 'its tag stays bland');
  await card.screenshot({ path: 'artifacts/v0.7.4-facet-tabs.png' });

  // The module window fits the viewport; below its search, the list scrolls on its own.
  await a.page.setViewportSize({ width: 1280, height: 520 });
  const moduleWindow = a.page.locator('.module-window');
  const list = moduleWindow.locator('.window-scroll');
  // Scrolled down, the sticky window stands wholly in the viewport.
  await a.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await waitFor(async () => { const box = await moduleWindow.boundingBox(); return box.y >= -1 && box.y + box.height <= 521; }, 'the window wholly in view');
  const windowBox = await moduleWindow.boundingBox();
  assert.ok(windowBox.height <= 520 - 48 + 1, `the window fits the viewport (${windowBox.height}px)`);
  assert.ok(await list.evaluate(node => node.scrollHeight > node.clientHeight + 20), 'the list overflows and scrolls');
  const searchAt = (await moduleWindow.locator('.window-search').boundingBox()).y;
  const pageAt = await a.page.evaluate(() => window.scrollY);
  const listBox = await list.boundingBox();
  await a.page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
  await a.page.mouse.wheel(0, 2000);
  await waitFor(() => list.evaluate(node => node.scrollTop + node.clientHeight >= node.scrollHeight - 1), 'list scrolled to its end');
  assert.equal((await moduleWindow.locator('.window-search').boundingBox()).y, searchAt, 'the heading and search stay put');
  assert.equal(await a.page.evaluate(() => window.scrollY), pageAt, 'the page does not scroll with it');
  await list.evaluate(node => { node.scrollTop = 120; });
  await moduleWindow.screenshot({ path: 'artifacts/v0.7.3-module-window-scroll.png' });
  await list.evaluate(node => { node.scrollTop = 0; });
  await a.page.setViewportSize({ width: 1280, height: 1400 });

  // Generating, a card's hung tags stay beneath its tab, so the rail does not cover the spark.
  await hung.locator('.tab-button').click();
  await a.page.getByRole('button', { name: 'Retry German 2', exact: true }).click();
  await waitFor(async () => await hung.getAttribute('data-generating') !== null, 'German 2 generating');
  await hung.locator('.spark').waitFor();
  const layers = await hung.evaluate(node => [getComputedStyle(node.querySelector('.card-tab')).zIndex, getComputedStyle(node.querySelector('.facet-tags')).zIndex]);
  assert.ok(Number(layers[0]) > Number(layers[1]), `the tab, with its spark, above the hung tags (${layers})`);
  const box = await hung.locator('.card-tab').boundingBox();
  assert.equal(await a.page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).find(node => node.matches('.spark i, .facet-tags, .card-tab'))?.className,
    { x: box.x + 30, y: box.y + box.height - 1 }), 'card-tab', 'at the tab\'s bottom edge the tab is uppermost, not the rail');
  await hung.locator('.card-tab').screenshot({ path: 'artifacts/v0.7.3-spark-over-rail.png' });
  release(wordResult(['Ufer'], { synonyms: ['Böschung'] }, { key: 'bank' }));
  await waitFor(async () => await hung.getAttribute('data-generating') === null, 'German 2 generated');
});

test('0.7.4: the live editor formats markdown in place: names and top line locked, no markdown shown, lists, bold, highlight, empty facets filled, any part emptied', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-live-editor-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'live-editor', epoch: 1 };
  await store.openSession('live-editor-session', session);
  const { pageId } = await store.capture('live-editor-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const first = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  const { antonyms, ...facets } = BANK.facets;
  await store.stage(first.attemptId, staged({ core: BANK.core, facets }));
  await store.publish('live-editor-publish', { attemptId: first.attemptId, session });
  const stored = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'german').content.blocks[0];
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  await card.locator('.entry-core').waitFor();
  await (await cardButton(a.page, 'Edit German')).click();
  const editor = card.getByRole('group', { name: 'Edit German', exact: true });
  await editor.waitFor();
  const part = name => editor.getByRole('textbox', { name: `${name}, German`, exact: true });

  // In place, formatted, with no markdown characters, numbers or separators of its own.
  assert.equal(await editor.locator('.entry-heading').textContent(), 'Englischbank');
  assert.deepEqual(await editor.locator('.facet-tab-label').allTextContents(), ['Article', 'Examples', 'Synonyms', 'Antonyms']);
  assert.equal(await part('Meanings').textContent(), 'Ufer');
  assert.equal(await part('Examples').locator('em').textContent(), 'Wir saßen am Ufer.', 'the translation is italic, not *starred*');
  assert.doesNotMatch(await editor.textContent(), /\*|==|`|^\s*\d+\./m);
  assert.equal(await a.page.evaluate(() => document.activeElement?.tagName), 'BODY', 'opening moves the focus nowhere');
  assert.notEqual(await editor.locator('.facet[data-facet="antonyms"]').getAttribute('data-unfilled'), null, 'the empty facet is dimmed in its place');
  await a.page.screenshot({ path: 'artifacts/v0.7.4-live-editor.png' });

  // Typing markdown formats live; Cmd/Ctrl+B toggles bold; lists and highlight by input rules.
  await part('Synonyms').click(); await a.page.keyboard.press('End');
  await a.page.keyboard.type(', **fest**');
  await waitFor(async () => await part('Synonyms').locator('strong').count() === 1, 'bold typed live');
  assert.equal(await part('Synonyms').textContent(), 'Böschung, fest');
  await part('Meanings').click(); await a.page.keyboard.press('ControlOrMeta+a');
  await a.page.keyboard.press('ControlOrMeta+b');
  await waitFor(async () => await part('Meanings').locator('strong').count() === 1, 'Cmd/Ctrl+B made bold');
  const tag = card.locator('.facet-tag[data-facet="antonyms"]');
  assert.notEqual(await tag.getAttribute('data-unfilled'), null);
  await part('Antonyms').click();
  await a.page.keyboard.type('- Strom');
  await waitFor(async () => await part('Antonyms').locator('ul li').count() === 1, 'a bulleted list typed live');
  await a.page.keyboard.type(' ==stark==');
  await waitFor(async () => await part('Antonyms').locator('mark').count() === 1, 'highlight typed live');
  await waitFor(async () => await tag.getAttribute('data-unfilled') === null, 'the tag fills as you type');
  await part('Article').click(); await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.press('Backspace');
  assert.doesNotMatch(await editor.textContent(), /\*|==|`/, 'still no markdown characters');
  assert.equal(await editor.locator('.md-editor > ul + p, .md-editor > ol + p').count(), 0, 'no blank line after a list');
  await a.page.screenshot({ path: 'artifacts/v0.7.4-live-editor-typed.png' });
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await card.locator('.live-editor').waitFor({ state: 'detached' });
  const saved = await stored();
  assert.equal(saved.core, '1. **Ufer**');
  assert.deepEqual(saved.facets, { examples: '1. We sat on the bank.\n   *Wir saßen am Ufer.*', synonyms: 'Böschung, **fest**', antonyms: '- Strom ==stark==' },
    'markdown written as the card reads it; the emptied Article gone; the empty Antonyms filled');
  assert.deepEqual(saved.header, { kind: 'word', language: 'Englisch', key: 'bank' }, 'the top line kept');
  // The card shows it formatted, in its containers.
  assert.equal(await card.locator('.entry-core strong').textContent(), 'Ufer');
  assert.equal(await card.locator('.facet[data-facet="antonyms"] ul li').count(), 1);
  assert.equal(await card.locator('.facet[data-facet="antonyms"] .md-highlight').textContent(), 'stark');
  assert.equal(await card.locator('.facet[data-facet="article"]').count(), 0);

  // Cancel discards; the core may be emptied too.
  await (await cardButton(a.page, 'Edit German')).click();
  await part('Meanings').click(); await a.page.keyboard.type('discarded');
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await stored()).core, '1. **Ufer**');
  await (await cardButton(a.page, 'Edit German')).click();
  await part('Meanings').click(); await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.press('Backspace');
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await card.locator('.live-editor').waitFor({ state: 'detached' });
  assert.equal((await stored()).core, '');
  assert.equal(await card.locator('.entry-heading').textContent(), 'Englischbank', 'an emptied core shows its top line');
  await a.page.screenshot({ path: 'artifacts/v0.7.4-live-editor-saved.png' });
});
