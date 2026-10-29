import test, { createTestApplication } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { blockText, notePlain } from '@vocabularium/domain/pages';
import { isContentType } from '@vocabularium/domain/page-modules';
import { formatContent } from '@vocabularium/domain/content';
import { PARENTS } from '@vocabularium/domain/parents';
import { resultFor, sentenceResult, text, textBlocks, useModules, wordResult, staged, fieldEdit } from './helpers/pages.mjs';

// A sample the catalog stores for the pages and the preview (D20), and the English labels of the facets it holds.
const catalogSample = async (folder, language = 'en') => JSON.parse(await readFile(`packages/domain/src/catalog/${folder}/samples/${language}.json`, 'utf8'));
const sampleFacetLabels = (parent, card) => Object.keys(PARENTS[parent].facets).filter(facet => facet in card.facets).map(facet => PARENTS[parent].facets[facet].label);
const keyOf = page => text(page.components.find(component => component.moduleType === 'main-key'));
// The bank entry with all four German facets, as structured content (D09).
// A German noun (D17): its grammatical role lets Article apply.
const BANK = { core: { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun', meanings: ['Ufer'] }, facets: { article: { singular: 'das Ufer', plural: 'die Ufer' },
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
// A parent's facet window (D13, 0.8.1), opened by Facet among its actions; already open, it is returned as it is.
async function facetWindow(page, label) {
  const window = page.getByRole('group', { name: `Facets of ${label}`, exact: true });
  if (await window.count()) return window;
  await cardTab(page, label).click();
  await page.getByRole('button', { name: `Facets of ${label}`, exact: true }).click();
  await window.waitFor();
  return window;
}
const tick = (window, facet) => window.getByRole('checkbox', { name: facet, exact: true });
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
  // A held key waits in every module's request until the test releases it.
  const held = new Map();
  const release = key => { for (const resolve of held.get(key)) resolve(); };
  const provider = {
    // Each parent reads the key and writes its own content in one request, as structured data (D08, D09, D17).
    async generate({ module, selectedText: text }, signal) {
      if (text.includes('held')) await new Promise((resolve, reject) => {
        held.set(text, [...(held.get(text) ?? []), resolve]); signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
      });
      if (text === 'fail') throw Error('controlled generation failure');
      if (text === '我真的很幸福') return sentenceResult(module.type === 'chinese' ? '我真的很幸福。' : 'Ich bin wirklich glücklich.', {}, { language: '汉语', key: text });
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

  step('sentence and failed generation');
  await captureFrom(a, '我真的很幸福'); await captureFrom(a, 'fail');
  await waitFor(async () => (await application.store.pages()).find(page => page.selectedText === 'fail')?.status === 'failed', 'failed generation persisted');
  const sentencePage = (await application.store.pages()).find(page => page.selectedText === '我真的很幸福');
  // Every parent applies to a sentence as well as a word (D08).
  assert.deepEqual(modulesOf(sentencePage).map(item => [Boolean(text(item)), item.status]), [[true, 'completed'], [true, 'completed']]);
  assert.equal(sentencePage.status, 'completed');

  step('dashboard closure during generation');
  await captureFrom(a, 'held-after-close');
  await waitFor(() => held.get('held-after-close')?.length === 2, 'dashboard-close requests started');
  await a.page.close();
  release('held-after-close');
  await waitFor(async () => (await application.store.pages()).find(page => page.selectedText === 'held-after-close')?.status === 'completed', 'dashboard closure leaves generation running');

  step('browser exit during generation');
  await captureFrom(a, 'held-interrupted');
  const interrupted = (await application.store.pages()).find(page => page.selectedText === 'held-interrupted');
  await waitFor(() => held.get('held-interrupted')?.length === 2, 'interrupted requests started');
  await a.context.close(); contexts.delete(a.context);
  release('held-interrupted');
  await waitFor(async () => (await application.store.attempt(modulesOf(interrupted)[1].attemptId)).result, 'late provider result staged');
  step('relaunch after browser exit');
  a = await launch(profile, testingExtension); contexts.add(a.context);
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  // Both components waited on their held requests, so neither was published before exit.
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
    async generate(request) { interpreted.push({ text: request.selectedText, context: request.context }); return resultFor(request, 'Glück'); }
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
  // Context is markdown, the main key highlighted (D10, amended a fourth time); compared here as generation reads it.
  const contextOf = page => page.components.filter(component => component.moduleType === 'context').map(component => notePlain(component.content)).filter(Boolean);

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
  await componentArticle(a.page, 'Context').locator('.note-body').filter({ hasText: 'Sie war 幸福 und lachte.' }).waitFor();
  assert.equal(await componentArticle(a.page, 'Context').locator('.note-body mark.md-highlight').first().textContent(), '幸福', 'the main key a stored highlight in Context');

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
      async generate(request) {
        await new Promise(resolve => { releaseGeneration = resolve; });
        return resultFor(request, 'Controlled explanation');
      }
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
  assert.equal(await a.page.locator('.module-window .window-module').count(), 6, 'the window offers Context, Text, the two Languages parents (D08) and the two Expertise modules (D11)');
  // Every module has its + (0.6.3; D04 had none); facets are not in the window (D13, 0.8.1).
  assert.equal(await a.page.locator('.window-module > .window-add').count(), 6, 'every module has its +');
  assert.equal(await a.page.locator('.window-facet').count(), 0, 'and no facet is listed');
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
  // The samples in the interface language (D20, C30): the bridges sentence.
  assert.match(await preview.locator('.preview').nth(0).textContent(), /Languages are the bridges connecting people and the world\./);
  // Every parent applies to a sentence: its translation, and the facets that apply (D08).
  assert.ok((await preview.locator('.preview').nth(2).textContent()).includes((await catalogSample('languages/german')).sentence.core.meanings[0]));
  assert.deepEqual(await preview.locator('.preview').nth(2).locator('.facet-tab-label').allTextContents(), ['Examples'], 'Article, Synonyms and Antonyms are for words');
  assert.equal(await preview.locator('.preview').nth(3).locator('.facet').count(), 0, 'a parent added from the window has its core only');
  assert.ok((await preview.locator('.preview').nth(4).textContent()).includes((await catalogSample('languages/chinese')).sentence.core.meanings[0]));
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
  // A parent's Facet opens its facet window (D13, 0.8.1).
  assert.deepEqual(await examples.locator('.card-actions button').allTextContents(), ['Edit', 'Retry', 'Facet', 'About', 'Fold', 'Delete']);
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
  assert.equal(await helpText.textContent(), 'Drag a module into the page, or back here to put it back. From the keyboard: Space picks it up, the arrow keys move it, Space drops it, Escape puts it back.');
  await a.page.mouse.move(5, 5);
  await helpText.waitFor({ state: 'hidden' });
  await help.click(); await a.page.mouse.move(5, 5);
  assert.equal(await helpText.isVisible(), true, 'a click keeps it open');
  await window.screenshot({ path: 'artifacts/v0.6.3-module-help.png' });
  await a.page.keyboard.press('Escape');
  await helpText.waitFor({ state: 'hidden' });
  const families = await window.locator('details').evaluateAll(nodes => nodes.map(node => [node.querySelector('summary').textContent, node.open]));
  // Translation is called Languages since 0.8.0; Expertise has no module on this page, so it starts closed (D11).
  assert.deepEqual(families, [['Languages2', true], ['Expertise2', false], ['Notes2', true]]);
  // A module on the page is not marked in the window (D13, 0.8.1), and the search no longer finds facets.
  assert.equal(await window.getByText('Already here').count(), 0);
  await window.getByLabel('Search modules', { exact: true }).fill('pinyin');
  await window.getByText('No module matches “pinyin”.').waitFor();
  await window.getByLabel('Search modules', { exact: true }).fill('chinese');
  assert.deepEqual(await window.locator('.window-module:visible').evaluateAll(nodes => nodes.map(node => node.dataset.type)), ['chinese']);
  await window.getByLabel('Search modules', { exact: true }).fill('nothing like this');
  await window.getByText('No module matches “nothing like this”.').waitFor();
  await window.getByLabel('Search modules', { exact: true }).fill('');
  assert.equal(await window.locator('.window-module').count(), 6);
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
  assert.equal(before.dataVersion, 4);
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
  assert.deepEqual([after.auth, after.installationId, after.dataVersion], [before.auth, before.installationId, 4]);
  assert.ok(Array.isArray(after.account.recentPages));
  assert.equal(await a.page.evaluate(() => sessionStorage.getItem('karte-draft')), null);
  assert.equal(await a.page.evaluate(() => sessionStorage.getItem('page-draft')), null);
});

test('parents and facets: core only on add, the facet window on the parent, its question, waiting and deleted facets, and deck settings', { timeout: 60000 }, async (t) => {
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
  await store.stage(first.attemptId, staged(BANK));
  await store.publish('facets-publish', { attemptId: first.attemptId, session });
  const card = name => componentArticle(a.page, name);
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await card('German').locator('.facet').first().waitFor();

  // The core, then each facet under its label. How the key was read is in the
  // card's top line, in the module's language, and nothing under the title (D17).
  assert.deepEqual(await card('German').locator('.entry-heading .entry-label').allTextContents(), ['Wort', 'Nomen']);
  assert.equal(await card('German').locator('.entry-heading .entry-language').textContent(), 'Englisch');
  assert.equal(await a.page.locator('.page-title .interpretation').count(), 0, 'no reading under the main key');
  assert.deepEqual(await card('German').locator('.facet .facet-tab-label').allTextContents(), ['Article', 'Examples', 'Synonyms', 'Antonyms']);
  assert.equal(await card('German').locator('.entry-core li').textContent(), 'Ufer');

  // The module window lists modules only: no facets beneath a parent (D13, 0.8.1).
  await openFamily(windowModule(a.page, 'german'));
  assert.equal(await a.page.locator('.module-window .window-facets, .module-window .window-facet').count(), 0, 'no facets in the window');

  // A German parent's facet window lists its four facets in the module's order, the ones it has ticked.
  let facets = await facetWindow(a.page, 'German');
  assert.deepEqual(await facets.locator('.facet-window-name').allTextContents(), ['Article', 'Examples', 'Synonyms', 'Antonyms', 'Conjugation', 'Declension', 'Comparison', 'Case'],
    'every facet of German, the grammar facets included (D17)');
  assert.deepEqual(await facets.getByRole('checkbox').evaluateAll(nodes => nodes.map(node => node.checked)), [true, true, true, true, false, false, false, false], 'the grammar facets are not on a My Deck card (K56)');
  await waitFor(() => tick(facets, 'Article').evaluate(node => node === document.activeElement), 'the first row takes the focus');

  // Unticking a facet with content asks in its row; Cancel keeps it.
  await tick(facets, 'Examples').click();
  const keep = facets.getByRole('button', { name: 'Keep Examples from German', exact: true });
  await waitFor(() => keep.evaluate(node => node === document.activeElement), 'Cancel takes the focus');
  await keep.click();
  await waitFor(() => tick(facets, 'Examples').evaluate(node => node === document.activeElement), 'the focus back on its tick');
  assert.equal(await tick(facets, 'Examples').isChecked(), true);
  assert.equal((await german())[0].facets.includes('examples'), true, 'Cancel keeps the facet');
  // Confirmed, it goes, leaving the rest of the content and the module; the window stays open for more.
  await tick(facets, 'Examples').click();
  await facets.getByRole('button', { name: 'Yes, delete Examples from German', exact: true }).click();
  await waitFor(async () => !(await german())[0].facets.includes('examples'), 'Examples deleted');
  await card('German').locator('.facet[data-facet="examples"]').waitFor({ state: 'detached' });
  assert.doesNotMatch(text((await german())[0]), /Examples/);
  assert.equal(await facets.isVisible(), true, 'the window stays open');
  assert.equal(await tick(facets, 'Examples').isChecked(), false);
  // Escape closes it and returns the focus to the card's tab.
  await a.page.keyboard.press('Escape');
  await facets.waitFor({ state: 'detached' });
  assert.equal(await cardTab(a.page, 'German').evaluate(node => node === document.activeElement), true, 'the focus back on the tab');

  // A parent added from the window has its core only; its facet window lists its own facets.
  await openFamily(windowModule(a.page, 'chinese'));
  await a.page.getByRole('button', { name: 'Add Chinese at the end', exact: true }).click();
  await card('Chinese').waitFor();
  const chinese = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'chinese');
  await waitFor(async () => Boolean(await chinese()), 'Chinese added');
  assert.deepEqual((await chinese()).facets, []);
  facets = await facetWindow(a.page, 'Chinese');
  assert.deepEqual(await facets.locator('.facet-window-name').allTextContents(), ['Examples', 'Pinyin'], 'never a German facet');
  assert.deepEqual(await facets.getByRole('checkbox').evaluateAll(nodes => nodes.map(node => node.checked)), [false, false]);
  await tick(facets, 'Pinyin').click();
  await waitFor(async () => (await chinese()).facets.includes('pinyin'), 'Pinyin added to Chinese');
  assert.equal((await german())[0].facets.includes('pinyin'), false);
  // A click outside closes the window.
  await a.page.locator('.page-header').click();
  await facets.waitFor({ state: 'detached' });

  // Ticked again on German, Examples joins in the parent's order and waits for Retry.
  facets = await facetWindow(a.page, 'German');
  await tick(facets, 'Examples').click();
  await waitFor(async () => (await german())[0].facets.includes('examples'), 'Examples added back');
  assert.deepEqual((await german())[0].facets, ['article', 'examples', 'synonyms', 'antonyms'], 'in the parent’s order');
  await a.page.keyboard.press('Escape');
  // A re-added facet waits in its slot: its heading only, dimmed, with no text (D10, amended a sixth time).
  await waitFor(async () => await card('German').locator('.facet-tag[data-facet="examples"][data-unfilled]').count() === 1, 'its bland tag');
  assert.notEqual(await card('German').locator('.facet[data-facet="examples"]').getAttribute('data-unfilled'), null, 'its heading, dimmed');
  assert.equal(await card('German').locator('.facet[data-facet="examples"] .facet-body').count(), 0, 'and no text');
  assert.deepEqual(await card('German').locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)),
    ['article', 'examples', 'synonyms', 'antonyms']);
  assert.deepEqual(await card('German').locator('.facet-tag .facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy', 'An']);
  await a.page.screenshot({ path: 'artifacts/v0.7.0-facets-page.png', fullPage: true });

  // Two German parents each choose their own facets: ticked on German 2, Synonyms goes there alone
  // and its tag flies in from its row (D13).
  await card('German').locator('.facet[data-facet="synonyms"]').hover();
  await a.page.getByRole('button', { name: 'Delete Synonyms from German', exact: true }).click();
  await a.page.getByRole('button', { name: 'Yes, delete Synonyms from German', exact: true }).click();
  await waitFor(async () => !(await german())[0].facets.includes('synonyms'), 'Synonyms deleted');
  await a.page.getByRole('button', { name: 'Add German at the end', exact: true }).click();
  await waitFor(async () => (await german()).length === 2, 'second German added');
  // Two Germans on one page are numbered in their tabs, in the page's order (0.7.2).
  await card('German 2').waitFor();
  assert.deepEqual(await a.page.locator('.component[data-type="german"] .tab-label').allTextContents(), ['German 1', 'German 2']);
  await a.page.evaluate(() => {
    window.tagMotions = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (this.classList?.contains('facet-tag')) window.tagMotions.push({ facet: this.dataset.facet, keyframes: keyframes.map(frame => frame.transform ?? null) });
      return original.call(this, keyframes, options);
    };
  });
  facets = await facetWindow(a.page, 'German 2');
  assert.deepEqual(await facets.getByRole('checkbox').evaluateAll(nodes => nodes.map(node => node.checked)), Array(8).fill(false), 'a core only');
  await a.page.screenshot({ path: 'artifacts/v0.8.1-facet-window.png', fullPage: true, animations: 'disabled' });
  await tick(facets, 'Synonyms').click();
  await waitFor(async () => (await german())[1].facets.includes('synonyms'), 'Synonyms added to the second German');
  assert.equal((await german())[0].facets.includes('synonyms'), false, 'and not to the first');
  await waitFor(async () => (await card('German 2').locator('.facet-tag .facet-tag-mark').allTextContents()).join() === 'Sy', 'its tag');
  const flight = (await a.page.evaluate(() => window.tagMotions)).filter(each => each.facet === 'synonyms' && each.keyframes.length === 3).at(-1);
  assert.ok(flight, 'the tag flies in from its row');
  await a.page.keyboard.press('Escape');

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
  // The preview shows the facets the deck has, as far as the sample holds them (D20: generated samples).
  const kept = (await catalogSample('languages/german')).word_phrase;
  assert.deepEqual(await a.page.locator('.preview-dialog .component[data-type="german"] .facet-tab-label').allTextContents(),
    sampleFacetLabels('german', { facets: Object.fromEntries(Object.entries(kept.facets).filter(([facet]) => ['article', 'examples', 'synonyms'].includes(facet))) }));
  await a.page.getByRole('button', { name: 'Close preview', exact: true }).click();
  // In deck settings the same window changes the draft; with no content to lose, unticking never asks.
  await a.page.getByRole('button', { name: 'Add German at the end', exact: true }).click();
  const deckGermans = a.page.locator('.deck-module[data-type="german"]');
  await deckGermans.nth(1).waitFor();
  facets = await facetWindow(a.page, 'German 2');
  await tick(facets, 'Antonyms').click();
  await waitFor(async () => (await deckGermans.nth(1).locator('.facet-tag-mark').allTextContents()).join() === 'An', 'Antonyms on German 2');
  assert.deepEqual(await deckGermans.nth(0).locator('.facet-tag-mark').allTextContents(), ['Ar', 'Ex', 'Sy']);
  await tick(facets, 'Antonyms').click();
  await waitFor(async () => await deckGermans.nth(1).locator('.facet-tag:not([data-leaving])').count() === 0, 'unticked at once');
  assert.equal(await facets.getByRole('button', { name: /^Yes, delete/ }).count(), 0, 'without a question');
  await tick(facets, 'Antonyms').click();
  await waitFor(async () => (await deckGermans.nth(1).locator('.facet-tag:not([data-leaving]) .facet-tag-mark').allTextContents()).join() === 'An', 'ticked again');
  await a.page.keyboard.press('Escape');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(async () => (await store.deck(deckId)).modules.filter(module => module.type === 'german').length === 2, 'deck saved');
  assert.deepEqual((await store.deck(deckId)).modules.filter(module => module.type === 'german').map(module => module.facets),
    [['article', 'examples', 'synonyms'], ['antonyms']]);
});

test('facet window from the keyboard: Facet among the actions, Space on a tick, the question and Escape, and back to the tab', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-keys-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facet-keys', epoch: 1 };
  await store.openSession('facet-keys-session', session);
  const { pageId } = await store.capture('facet-keys-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const german = () => store.page(pageId).then(page => page.components.find(item => item.moduleType === 'german'));
  const first = await german();
  await store.stage(first.attemptId, staged(BANK));
  await store.publish('facet-keys-publish', { attemptId: first.attemptId, session });
  const card = name => componentArticle(a.page, name);
  const focused = locator => locator.evaluate(node => node === document.activeElement);
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await card('German').locator('.facet').first().waitFor();

  // Enter on the tab ejects the actions; Facet stands after Retry (D13, 0.8.1), About before Fold (D20).
  await cardTab(a.page, 'German').focus();
  await a.page.keyboard.press('Enter');
  const actions = card('German').locator('.card-actions button');
  await actions.first().waitFor();
  assert.deepEqual(await actions.allTextContents(), ['Edit', 'Retry', 'Facet', 'About', 'Fold', 'Delete']);
  await a.page.getByRole('button', { name: 'Facets of German', exact: true }).focus();
  await a.page.keyboard.press('Enter');
  const facets = a.page.getByRole('group', { name: 'Facets of German', exact: true });
  await facets.waitFor();
  await waitFor(() => focused(tick(facets, 'Article')), 'the focus on the first tick');

  // Tab moves through each row's ›, then its tick; Space on a tick with content asks, with the focus on
  // Cancel; Escape takes back the question and returns the focus to its tick, still ticked.
  await a.page.keyboard.press('Tab');
  assert.equal(await focused(facets.getByRole('button', { name: 'About Examples', exact: true })), true);
  await a.page.keyboard.press('Tab');
  await a.page.keyboard.press('Tab');
  await a.page.keyboard.press('Tab');
  assert.equal(await focused(tick(facets, 'Synonyms')), true);
  await a.page.keyboard.press('Space');
  await waitFor(() => focused(facets.getByRole('button', { name: 'Keep Synonyms from German', exact: true })), 'Cancel focused');
  await a.page.keyboard.press('Escape');
  await waitFor(() => focused(tick(facets, 'Synonyms')), 'the focus back on its tick');
  assert.equal(await tick(facets, 'Synonyms').isChecked(), true);
  assert.equal(await facets.isVisible(), true, 'the first Escape answers the question only');
  // Asked again, Shift+Tab reaches the final Delete, and Enter removes the facet.
  await a.page.keyboard.press('Space');
  await waitFor(() => focused(facets.getByRole('button', { name: 'Keep Synonyms from German', exact: true })), 'Cancel focused');
  await a.page.keyboard.press('Shift+Tab');
  assert.equal(await focused(facets.getByRole('button', { name: 'Yes, delete Synonyms from German', exact: true })), true);
  await a.page.keyboard.press('Enter');
  await waitFor(async () => !(await german()).facets.includes('synonyms'), 'Synonyms removed');
  await waitFor(() => focused(tick(facets, 'Synonyms')), 'the focus back on its tick');
  // Once the removal is saved, Space ticks it again; it waits for Retry. While it saves, the ticks are unavailable.
  await waitFor(async () => await tick(facets, 'Synonyms').getAttribute('aria-disabled') === null, 'the ticks available again');
  await a.page.keyboard.press('Space');
  await waitFor(async () => (await german()).facets.includes('synonyms'), 'Synonyms added again');
  await waitFor(async () => await card('German').locator('.facet-tag[data-facet="synonyms"][data-unfilled]').count() === 1, 'waiting for Retry');
  // Escape closes the window and returns the focus to the tab.
  await a.page.keyboard.press('Escape');
  await facets.waitFor({ state: 'detached' });
  assert.equal(await focused(cardTab(a.page, 'German')), true);

  // While the card is edited its actions stay in, so the window cannot open.
  await (await cardButton(a.page, 'Edit German')).click();
  await card('German').locator('.component-tools').waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Facets of German', exact: true }).count(), 0);
  await card('German').getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('0.13.0: family, module and facet pages in one sheet, from the module window, a card, the facet window and deck settings (D20)', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-explanations-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'explanations', epoch: 1 };
  await store.openSession('explanations-session', session);
  const { pageId } = await store.capture('explanations-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const [german] = (await store.page(pageId)).components.filter(item => item.moduleType === 'german');
  await store.stage(german.attemptId, staged(BANK));
  await store.publish('explanations-publish', { attemptId: german.attemptId, session });
  const components = async () => (await store.page(pageId)).components.length;
  const before = await components();
  const focused = locator => locator.evaluate(node => node === document.activeElement);
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await componentArticle(a.page, 'German').waitFor();

  // About German, below its description, opens its module page in the sheet over the module window (D20, 0.13.0).
  const sheet = a.page.locator('dialog.about-sheet');
  const title = () => sheet.locator('h2').innerText();
  const path = () => sheet.locator('.about-path').innerText();
  const about = a.page.locator('.window-module[data-type="german"] .window-about');
  await openFamily(about);
  assert.equal(await about.innerText(), 'About German');
  await about.click();
  await sheet.waitFor();
  assert.equal(await title(), 'German');
  assert.match(await path(), /^Languages\s*\/\s*German$/);
  assert.match(await sheet.locator('.about-lede').innerText(), /Explains your key in German/);
  assert.equal(await sheet.locator('.about-facts > div').count(), 3);
  // How it looks: the key above a card with its core only, then the hint that facets follow.
  assert.equal(await sheet.locator('.about-key').innerText(), 'language');
  assert.equal(await sheet.locator('.about-card .facet').count(), 0, 'the core only');
  await sheet.locator('.about-card .about-facet-hint').waitFor();
  // How it works: four lines from the key to the facets.
  assert.deepEqual(await sheet.locator('.about-chain-label').allTextContents(), ['Main key', 'Read as', 'Module core', 'Facets']);
  const english = await catalogSample('languages/german');
  assert.deepEqual(await sheet.locator('.about-chain .about-mk:not([data-out])').allTextContents(),
    Object.keys(PARENTS.german.facets).filter(facet => facet in english.word_phrase.facets).map(facet => PARENTS.german.facets[facet].abbreviation));
  await a.page.screenshot({ path: 'artifacts/v0.13.0-module-page.png', animations: 'disabled' });
  // The key's language and a sentence change the sample; only Examples applies to a sentence.
  // Each language named in itself only (D21).
  assert.deepEqual(await sheet.locator('select option').allTextContents(), ['العربية', 'English', 'Español', 'Français', 'Русский', '中文（简体）']);
  await sheet.getByLabel('Language of the sample key', { exact: true }).selectOption('ru');
  assert.equal(await sheet.locator('.about-key').innerText(), 'язык');
  await sheet.getByRole('button', { name: 'Sentence', exact: true }).click();
  assert.equal(await sheet.locator('.about-key').innerText(), (await catalogSample('main-key', 'ru')).sentence);
  assert.ok((await sheet.locator('.about-card').innerText()).includes((await catalogSample('languages/german', 'ru')).sentence.core.meanings[0]));
  assert.deepEqual(await sheet.locator('.about-chain .about-mk:not([data-out])').allTextContents(), ['Ex']);

  // Article among its facets opens its facet page; Conjugation from the strip has its own word.
  await sheet.locator('.about-row', { hasText: 'Article' }).click();
  await waitFor(async () => await title() === 'Article', 'Article’s page');
  assert.match(await path(), /^Languages\s*\/\s*German\s*\/\s*Article$/);
  assert.equal(await sheet.locator('.about-applies').innerText(), 'Nouns');
  const { singular, plural } = english.word_phrase.facets.article;
  assert.equal(await sheet.locator('.about-facet-card .facet-body').innerText(), [singular, plural].filter(Boolean).join(' · '));
  await sheet.locator('.about-where .about-here').waitFor();
  await a.page.screenshot({ path: 'artifacts/v0.13.0-facet-page.png', animations: 'disabled' });
  await sheet.getByRole('button', { name: 'Sentence', exact: true }).click();
  assert.match(await sheet.locator('.about-left-out').innerText(), /Left out/);
  await sheet.locator('.about-strip button', { hasText: 'Conjugation' }).click();
  await waitFor(async () => await title() === 'Conjugation', 'Conjugation’s page');
  assert.equal(await sheet.locator('.about-key').innerText(), 'speak');
  assert.match(await sheet.locator('.about-facet-card').innerText(), /habe gesprochen/);
  // Back returns one step; the path's German and Languages open theirs.
  await sheet.getByRole('button', { name: 'Back', exact: true }).click();
  await waitFor(async () => await title() === 'Article', 'back to Article');
  await sheet.locator('.about-path button', { hasText: 'German' }).click();
  await waitFor(async () => await title() === 'German', 'German from the path');
  await sheet.locator('.about-path button', { hasText: 'Languages' }).click();
  await waitFor(async () => await title() === 'Languages', 'the family page');
  assert.deepEqual(await sheet.locator('.about-row .about-row-name').allTextContents(), ['German', 'Chinese']);
  assert.equal(await sheet.locator('.about-steps > li').count(), 3);
  await a.page.screenshot({ path: 'artifacts/v0.13.0-family-page.png', animations: 'disabled' });
  // Escape closes the sheet, returns the focus to About German, and adds nothing.
  await a.page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await focused(about), true, 'the focus back on About German');
  assert.equal(await components(), before, 'reading a page adds nothing');

  // The family's mark and name in its group's heading open the family page, leaving the group as it was (D21); the close button closes it.
  const group = a.page.locator('.window-family.fam-translation');
  const wasOpen = await group.evaluate(node => node.open);
  await a.page.getByRole('button', { name: 'About Languages', exact: true }).click();
  await waitFor(async () => await title() === 'Languages', 'Languages from the window');
  assert.equal(await group.evaluate(node => node.open), wasOpen, 'opening the page does not fold the group');
  await sheet.getByRole('button', { name: 'Close About Languages', exact: true }).click();
  await sheet.waitFor({ state: 'detached' });
  // An Expertise module's page keeps its own term, with no language dropdown and no How it works; a click outside closes it.
  const aboutCs = a.page.locator('.window-module[data-type="computer-science"] .window-about');
  await openFamily(aboutCs);
  await aboutCs.click();
  await waitFor(async () => await title() === 'Computer Science', 'Computer Science’s page');
  assert.equal(await sheet.locator('select').count(), 0);
  assert.equal(await sheet.locator('.about-chain').count(), 0);
  assert.match(await sheet.locator('.about-card').innerText(), /Hello, world/);
  await a.page.mouse.click(5, 5);
  await sheet.waitFor({ state: 'detached' });

  // In the facet window a row's › opens the facet's page over the window, which stays open beneath it.
  const facets = await facetWindow(a.page, 'German');
  const info = name => facets.getByRole('button', { name: `About ${name}`, exact: true });
  await info('Article').click();
  await waitFor(async () => await title() === 'Article', 'Article from the facet window');
  await a.page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });
  assert.equal(await facets.isVisible(), true, 'the facet window stays open');
  assert.equal(await focused(info('Article')), true, 'the focus back on its ›');
  assert.deepEqual(await facets.getByRole('checkbox').evaluateAll(nodes => nodes.map(node => node.checked)), [true, true, true, true, false, false, false, false], 'the grammar facets are not on a My Deck card (K56)');
  await a.page.keyboard.press('Escape');

  // The card's own About opens its module page.
  await cardTab(a.page, 'German').click();
  await componentArticle(a.page, 'German').locator('.card-actions').getByRole('button', { name: 'About German', exact: true }).click();
  await waitFor(async () => await title() === 'German', 'German from its card');
  // Both themes, with forced colours off and on, the sheet keeps its edge and readable text.
  for (const colorScheme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
    await a.page.emulateMedia({ colorScheme, forcedColors });
    await a.page.screenshot({ path: `artifacts/v0.13.0-module-page-${colorScheme}${forcedColors === 'active' ? '-forced' : ''}.png`, animations: 'disabled' });
  }
  await a.page.emulateMedia({ colorScheme: 'light', forcedColors: 'none' });
  await a.page.keyboard.press('Escape');
  await sheet.waitFor({ state: 'detached' });

  // Deck settings open the same page, About first among a module's actions.
  const deckId = (await store.page(pageId)).deckId;
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  const row = a.page.locator('.deck-module[data-type="german"]');
  await row.locator('.tab-button').click();
  assert.deepEqual(await row.locator('.card-actions button').allTextContents(), ['About', 'Facet', 'Remove']);
  await row.getByRole('button', { name: 'About German', exact: true }).click();
  await waitFor(async () => await title() === 'German', 'German from deck settings');
  await a.page.keyboard.press('Escape');
});

test('facet tags: abbreviations in order, on the left edge, along the edge to the bottom right when folded and back, flown in from the facet window, popped when deleted, and hung from the tab in deck settings', { timeout: 60000 }, async (t) => {
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

  // Ticked again in the facet window, the tag flies in from its row to its place in the parent's order (D13).
  const facets = await facetWindow(a.page, 'German');
  await tick(facets, 'Antonyms').click();
  // Measured after the click, which scrolls its row into view first.
  const origin = await facets.locator('.facet-window-row[data-facet="antonyms"] .facet-tab-mark').boundingBox();
  await card.locator('.facet-tag[data-facet="antonyms"]').waitFor();
  const flight = (await motions('antonyms')).at(-1);
  assert.equal(flight.keyframes.length, 3, 'an arc from the row');
  const [, dx, dy] = flight.keyframes[0].match(/^translate\((-?[\d.]+)px, (-?[\d.]+)px/);
  const landed = await card.locator('.facet-tag[data-facet="antonyms"]').evaluate(node => { node.getAnimations().forEach(each => each.finish()); const box = node.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; });
  assert.ok(Math.abs(landed.x + Number(dx) - (origin.x + origin.width / 2)) < 4 && Math.abs(landed.y + Number(dy) - (origin.y + origin.height / 2)) < 4,
    `it starts out at its row (${flight.keyframes[0]}; landed ${JSON.stringify(landed)}, row ${JSON.stringify(origin)})`);
  await a.page.keyboard.press('Escape');
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
  // Removed there, a tag pops; ticked again in the facet window, it flies in from its row.
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
  const deckFacets = await facetWindow(a.page, 'German');
  await tick(deckFacets, 'Antonyms').click();
  await row.locator('.facet-tag[data-facet="antonyms"]').waitFor();
  await a.page.keyboard.press('Escape');
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
  await tick(await facetWindow(a.page, 'German'), 'Article').click();
  await row.locator('.facet-tag[data-facet="article"]').waitFor();
  assert.equal((await motions('article')).at(-1)?.keyframes.length, 3, 'flown in, not moved from where it stood before');
});

test('0.7.3: a facet’s own Retry beside its Delete, a tag’s remove keeping its colours, and hung tags lifting with their tab', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-retry-browser-'));
  const calls = [];
  let release;
  const application = await createTestApplication(t, { provider: {
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
  // Structured content (D09).
  // A noun (D17): Article applies, so its own Retry asks the provider.
  const core = { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun', meanings: ['Ufer'] };
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
    ['About Examples from German 1', 'Edit Examples from German 1', 'Retry Examples from German 1', 'Delete Examples from German 1']);
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
  // The main key is a stored highlight in what was generated (D10, amended a fourth time):
  // the editor shows it, and removing it there removes it from the card.
  assert.equal(await examples.locator('.facet-body mark.md-highlight').textContent(), 'bank');
  await examples.hover();
  await a.page.getByRole('button', { name: 'Edit Examples from German 1', exact: true }).click();
  const exampleText = card.getByRole('textbox', { name: 'Examples, German 1', exact: true });
  await exampleText.waitFor();
  assert.equal(await exampleText.locator('mark').textContent(), 'bank', 'the editor shows the main key’s highlight');
  await exampleText.locator('mark').dblclick(); await a.page.waitForTimeout(300);
  await examples.locator('.md-toolbar [data-tool="highlight"]').click();
  assert.equal(await exampleText.locator('mark').count(), 0);
  await examples.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  assert.equal(await examples.locator('.facet-body mark').count(), 0, 'and it stays removed on the card');
  assert.match(await examples.textContent(), /The bank was steep\./);
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
  assert.deepEqual(await card.locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)), ['article', 'examples', 'synonyms', 'antonyms']);
  await card.screenshot({ path: 'artifacts/v0.7.4-facet-generating.png' });
  await waitFor(() => calls.length === 2, 'facet provider started again');
  assert.deepEqual(calls[1].facets, ['synonyms']);
  release({ facets: { synonyms: ['Böschung'] } });
  await synonyms.locator('.facet-body').waitFor();
  assert.equal(await synonyms.getAttribute('data-pending'), null, 'the block stays, with its content');
  assert.deepEqual(await card.locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)), ['article', 'examples', 'synonyms', 'antonyms'],
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
  // An empty result leaves its heading, dimmed, with no text (D10, amended a sixth time).
  await waitFor(async () => await card.locator('.facet[data-facet="antonyms"]').getAttribute('data-pending') === null, 'Antonyms done');
  assert.equal(await card.locator('.facet[data-facet="antonyms"] .facet-body').count(), 0);
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

test('0.7.5: the parent editor in place: names and top line locked, no markdown (typed stays typed), the toolbar beside the focused part, empty facets filled, any part emptied', { timeout: 60000 }, async (t) => {
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
  // The editor looks as the card will (D10, amended): the same number column, fonts and colours.
  const looks = scope => scope.evaluate(node => {
    const style = (element, pseudo) => { const css = getComputedStyle(element, pseudo); return [css.fontFamily, css.fontSize, css.fontStyle, css.color, css.fontWeight, css.lineHeight]; };
    const core = node.querySelector('.entry-core li, .live-core li');
    const example = node.querySelector('.facet[data-facet="examples"] li');
    return { coreNumber: style(core, '::before'), coreText: style(core), exampleNumber: style(example, '::before'), example: style(example),
      translation: style(example.querySelector('em')), synonyms: style(node.querySelector('.facet[data-facet="synonyms"] p')) };
  });
  const onCard = await looks(card);
  await (await cardButton(a.page, 'Edit German')).click();
  const editor = card.getByRole('group', { name: 'Edit German', exact: true });
  await editor.waitFor();
  assert.deepEqual(await looks(card), onCard, 'what is edited looks as the card shows it');
  await editor.waitFor();
  const part = name => editor.getByRole('textbox', { name: `${name}, German`, exact: true });

  // In place, formatted, with no markdown characters, numbers or separators of its own.
  assert.equal(await editor.locator('.entry-heading').textContent(), 'EnglischbankWortNomen', 'the top line with its labels (D17), not editable');
  assert.deepEqual(await editor.locator('.facet-tab-label').allTextContents(), ['Article', 'Examples', 'Synonyms', 'Antonyms']);
  assert.equal(await part('Meanings').textContent(), 'Ufer');
  assert.equal(await part('Examples').locator('em').textContent(), 'Wir saßen am Ufer.', 'the translation is italic, not *starred*');
  assert.doesNotMatch(await editor.textContent(), /\*|==|`|^\s*\d+\./m);
  assert.equal(await a.page.evaluate(() => document.activeElement?.tagName), 'BODY', 'opening moves the focus nowhere');
  assert.notEqual(await editor.locator('.facet[data-facet="antonyms"]').getAttribute('data-unfilled'), null, 'the empty facet is dimmed in its place');
  await a.page.screenshot({ path: 'artifacts/v0.7.4-live-editor.png' });

  // No markdown (D10, 0.7.5): typed markdown stays as typed; the toolbar formats.
  const toolbars = editor.locator('.md-toolbar');
  const facetTool = (facet, label) => editor.locator(`.facet[data-facet="${facet}"] .md-toolbar`).getByRole('button', { name: label, exact: true });
  const coreTool = label => editor.locator('.live-core .md-toolbar').getByRole('button', { name: label, exact: true });
  assert.equal(await toolbars.count(), 0, 'no toolbar while nothing is focused');
  await part('Synonyms').click(); await a.page.keyboard.press('End');
  await a.page.keyboard.type(', **fest**');
  assert.equal(await part('Synonyms').textContent(), 'Böschung, **fest**', 'typed markdown stays as typed');
  assert.equal(await part('Synonyms').locator('strong').count(), 0);
  assert.equal(await toolbars.count(), 1, 'one toolbar, beside the focused facet');
  assert.equal(await editor.locator('.facet[data-facet="synonyms"] .facet-title .md-toolbar').count(), 1, 'on its rule, beside its tab');
  assert.deepEqual(await toolbars.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['Bold', 'Italic', 'Highlight', 'Highlight colours', 'Inline code', 'Bulleted list', 'Numbered list']);
  // A button shows whether its formatting applies at the cursor.
  await part('Examples').locator('em').click();
  await waitFor(async () => await facetTool('examples', 'Italic').getAttribute('aria-pressed') === 'true', 'Italic pressed in the translation');
  assert.equal(await facetTool('examples', 'Bold').getAttribute('aria-pressed'), 'false');
  assert.equal(await toolbars.count(), 1, 'the toolbar follows the focus');
  // Bold from the toolbar and from Cmd/Ctrl+B; inline code from the toolbar, keeping the focus in the text.
  await part('Meanings').click(); await a.page.keyboard.press('ControlOrMeta+a');
  await coreTool('Bold').click();
  assert.equal(await part('Meanings').locator('strong').count(), 1);
  assert.equal(await a.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Meanings, German', 'the focus stays in the text');
  await a.page.keyboard.press('ControlOrMeta+b');
  assert.equal(await part('Meanings').locator('strong').count(), 0, 'Cmd/Ctrl+B toggles it back');
  await a.page.keyboard.press('ControlOrMeta+b');
  // Faster than a person, ProseMirror would still hold the whole selection.
  await a.page.waitForTimeout(300);
  await part('Meanings').click(); await a.page.waitForTimeout(300);
  await a.page.keyboard.type(' x'); await a.page.keyboard.press('Shift+ArrowLeft');
  await coreTool('Inline code').click();
  assert.equal(await part('Meanings').locator('code').textContent(), 'x');
  // Lists and highlight from the toolbar; a typed "- " stays a dash.
  const tag = card.locator('.facet-tag[data-facet="antonyms"]');
  assert.notEqual(await tag.getAttribute('data-unfilled'), null);
  await part('Antonyms').click();
  await a.page.keyboard.type('- Strom');
  assert.equal(await part('Antonyms').locator('ul').count(), 0, 'no list from a typed dash');
  await waitFor(async () => await tag.getAttribute('data-unfilled') === null, 'the tag fills as you type');
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.type('Strom stark');
  await facetTool('antonyms', 'Bulleted list').click();
  assert.equal(await part('Antonyms').locator('ul li').count(), 1);
  assert.equal(await facetTool('antonyms', 'Bulleted list').getAttribute('aria-pressed'), 'true');
  await facetTool('antonyms', 'Numbered list').click();
  assert.equal(await part('Antonyms').locator('ol li').count(), 1, 'the numbered list takes its place');
  await a.page.keyboard.press('End');
  for (let i = 0; i < 5; i++) await a.page.keyboard.press('Shift+ArrowLeft');
  await facetTool('antonyms', 'Highlight').click();
  assert.equal(await part('Antonyms').locator('mark').textContent(), 'stark');
  // Pasted markdown stays as its characters.
  await a.page.waitForTimeout(300); await part('Synonyms').click(); await a.page.waitForTimeout(300);
  await part('Synonyms').evaluate(node => {
    const data = new DataTransfer(); data.setData('text/plain', ' ==p==');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  assert.match(await part('Synonyms').textContent(), /\*\*fest\*\* ==p==$/);
  // Tabbing to the toolbar keeps it shown; leaving the part hides it.
  await part('Article').click(); await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.press('Backspace');
  await a.page.keyboard.press('Shift+Tab');
  assert.equal(await a.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Numbered list', 'the toolbar is reached from the keyboard');
  assert.equal(await editor.locator('.facet[data-facet="article"] .md-toolbar').count(), 1);
  assert.equal(await editor.locator('.md-editor > ul + p, .md-editor > ol + p').count(), 0, 'no blank line after a list');
  await part('Antonyms').click();
  await editor.locator('.facet[data-facet="antonyms"] .facet-title').screenshot({ path: 'artifacts/v0.7.5-toolbar.png' });
  await a.page.screenshot({ path: 'artifacts/v0.7.5-toolbar-editor.png' });
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await card.locator('.live-editor').waitFor({ state: 'detached' });
  const saved = await stored();
  assert.equal(saved.core, '1. **Ufer** `x`');
  assert.deepEqual(saved.facets, { examples: '1. We sat on the bank.\n   *Wir saßen am Ufer.*', synonyms: 'Böschung, \\*\\*fest\\*\\* \\=\\=p\\=\\=', antonyms: '1. Strom ==stark==' },
    'typed markdown stored escaped; the emptied Article gone; the empty Antonyms filled');
  assert.deepEqual(saved.header, { kind: 'word', language: 'Englisch', key: 'bank', gramRole: 'noun' }, 'the top line kept, its flags included');
  // The card shows the formatting, and typed markdown as typed.
  assert.equal(await card.locator('.entry-core strong').textContent(), 'Ufer');
  assert.equal(await card.locator('.facet[data-facet="synonyms"]').locator('.facet-body').textContent(), 'Böschung, **fest** ==p==');
  assert.equal(await card.locator('.facet[data-facet="antonyms"] ol li').count(), 1);
  assert.equal(await card.locator('.facet[data-facet="antonyms"] .md-highlight').textContent(), 'stark');
  // The emptied Article keeps its heading, dimmed, with no text (D10, amended a sixth time).
  assert.notEqual(await card.locator('.facet[data-facet="article"]').getAttribute('data-unfilled'), null);
  assert.equal(await card.locator('.facet[data-facet="article"] .facet-body').count(), 0);
  // The default highlight is the main key's yellow (D10, amended a third time); the card draws no emphasis of its own (fourth).
  assert.equal(await card.locator('.facet[data-facet="antonyms"] .md-highlight').evaluate(node => getComputedStyle(node).backgroundColor),
    await a.page.evaluate(() => { const probe = document.body.appendChild(Object.assign(document.createElement('i'), { style: 'background: var(--highlight)' }));
      const colour = getComputedStyle(probe).backgroundColor; probe.remove(); return colour; }));
  assert.equal(await card.locator('mark:not(.md-highlight)').count(), 0, 'no drawn emphasis of the main key');

  // Cancel discards; the core may be emptied too.
  await (await cardButton(a.page, 'Edit German')).click();
  await part('Meanings').click(); await a.page.keyboard.type('discarded');
  await card.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await stored()).core, '1. **Ufer** `x`');
  await (await cardButton(a.page, 'Edit German')).click();
  await part('Meanings').click(); await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.press('Backspace');
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await card.locator('.live-editor').waitFor({ state: 'detached' });
  assert.equal((await stored()).core, '');
  assert.equal(await card.locator('.entry-heading').textContent(), 'EnglischbankWortNomen', 'an emptied core shows its top line');
  await a.page.screenshot({ path: 'artifacts/v0.7.4-live-editor-saved.png' });
});

test('0.7.5: a facet’s own Edit opens that facet alone in place, with its toolbar, Save and Cancel, and saves only that facet', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-facet-edit-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'facet-edit', epoch: 1 };
  await store.openSession('facet-edit-session', session);
  const { pageId } = await store.capture('facet-edit-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const first = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  const { antonyms, ...facets } = BANK.facets;
  await store.stage(first.attemptId, staged({ core: BANK.core, facets }));
  await store.publish('facet-edit-publish', { attemptId: first.attemptId, session });
  const german = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  const stored = async () => (await german()).content.blocks[0];
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  const synonyms = card.locator('.facet[data-facet="synonyms"]');
  await synonyms.waitFor();

  // The Examples are plain text like every other facet (D10, amended again).
  const font = locator => locator.evaluate(node => { const css = getComputedStyle(node); return [css.fontFamily, css.fontSize, css.lineHeight]; });
  assert.deepEqual(await font(card.locator('.facet[data-facet="examples"] li > span')), await font(card.locator('.facet[data-facet="article"] p')));
  // Edit sits beside Retry and Delete, for a facet with content.
  await synonyms.hover();
  assert.deepEqual(await synonyms.locator('.facet-actions button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['About Synonyms from German', 'Edit Synonyms from German', 'Retry Synonyms from German', 'Delete Synonyms from German']);
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();

  // That facet alone becomes an editor in place, focused, with its toolbar and its Save and Cancel below it.
  const text = card.getByRole('textbox', { name: 'Synonyms, German', exact: true });
  await text.waitFor();
  assert.equal(await card.getByRole('textbox').count(), 1, 'only that facet is open');
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'the focus is in its text');
  assert.equal(await synonyms.locator('.facet-title .md-toolbar').count(), 1);
  assert.deepEqual(await synonyms.locator('.component-tools button').allTextContents(), ['Cancel', 'Save']);
  assert.equal(await card.locator(':scope > .card-fold .component-tools').count(), 1, 'one Save and Cancel, the facet\'s');
  assert.deepEqual(await card.locator('.facet').evaluateAll(sections => sections.map(each => each.dataset.facet)), ['article', 'examples', 'synonyms', 'antonyms'], 'in its place');
  assert.match(await card.locator('.facet[data-facet="article"]').textContent(), /das Ufer · die Ufer/, 'the rest reads as before');
  // It counts as editing the card: the other facets' actions and the card's Edit wait.
  await card.locator('.facet[data-facet="article"]').hover();
  assert.equal(await a.page.getByRole('button', { name: 'Edit Article from German', exact: true }).isDisabled(), true);
  assert.equal(await a.page.getByRole('button', { name: 'Retry Article from German', exact: true }).isDisabled(), true);
  assert.equal(await card.locator('.card-actions').count(), 0, 'the card\'s actions are put away');
  await a.page.screenshot({ path: 'artifacts/v0.7.5-facet-edit.png' });

  // Cancel restores everything.
  await text.click(); await a.page.keyboard.type(', discarded');
  await synonyms.getByRole('button', { name: 'Cancel', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  assert.equal((await stored()).facets.synonyms, 'Böschung');
  assert.equal(await synonyms.locator('.facet-body').textContent(), 'Böschung');

  // Save writes only that facet, over the latest content: another installation's core edit meanwhile stays.
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused again');
  await a.page.keyboard.type(', fest');
  await a.page.keyboard.press('Shift+ArrowLeft'); await a.page.keyboard.press('Shift+ArrowLeft');
  await a.page.keyboard.press('Shift+ArrowLeft'); await a.page.keyboard.press('Shift+ArrowLeft');
  await synonyms.locator('.md-toolbar').getByRole('button', { name: 'Bold', exact: true }).click();
  await store.savePage('facet-edit-elsewhere', { pageId, changes: [{ componentId: first.id, content: fieldEdit(await german(), 'Flussufer') }] });
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  const saved = await stored();
  assert.equal(saved.facets.synonyms, 'Böschung, **fest**');
  assert.equal(saved.core, '1. Flussufer', 'the core changed elsewhere is kept');
  assert.equal(saved.facets.article, 'das Ufer · die Ufer');
  await waitFor(async () => (await synonyms.locator('.facet-body strong').count()) === 1, 'the card shows it');

  // A size and a font from the toolbar, on the selected text; saved inside the markdown, shown on the card, read back when edited.
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused for size');
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.waitForTimeout(300);
  const size = synonyms.locator('.md-toolbar').getByRole('combobox', { name: 'Text size', exact: true });
  const fontChoice = synonyms.locator('.md-toolbar').getByRole('combobox', { name: 'Font', exact: true });
  assert.deepEqual([await size.inputValue(), await fontChoice.inputValue()], ['', ''], 'Normal and Text at first');
  await size.selectOption('large');
  await fontChoice.selectOption('display');
  await waitFor(async () => await text.locator('.md-size-large .md-font-display, .md-font-display .md-size-large').count() > 0, 'the editor shows it at once');
  await synonyms.locator('.facet-title').screenshot({ path: 'artifacts/v0.7.5-size-font-toolbar.png' });
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  assert.equal((await stored()).facets.synonyms, '[Böschung,]{size=large font=display} **[fest]{size=large font=display}**');
  assert.equal(await synonyms.locator('.facet-body .md-size-large.md-font-display').count(), 2, 'the card shows it as set');
  assert.equal(await synonyms.locator('.facet-body').textContent(), 'Böschung, fest');
  await card.screenshot({ path: 'artifacts/v0.7.5-size-font-card.png' });
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await text.locator('strong').click();
  await waitFor(async () => await size.inputValue() === 'large' && await fontChoice.inputValue() === 'display', 'the choices show what applies');
  await synonyms.getByRole('button', { name: 'Cancel', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });

  // A highlight colour from the palette: the button keeps the last one used; saved in the span, shown on the card.
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused for colour');
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.waitForTimeout(300);
  await synonyms.locator('.md-toolbar').getByRole('button', { name: 'Highlight colours', exact: true }).click();
  const palette = synonyms.locator('.md-palette');
  assert.deepEqual(await palette.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['Yellow highlight', 'Green highlight', 'Blue highlight', 'Pink highlight', 'Orange highlight', 'No highlight']);
  { const box = await synonyms.locator('.facet-title').boundingBox();
    await a.page.screenshot({ path: 'artifacts/v0.7.5-highlight-palette.png', clip: { x: box.x + box.width - 340, y: box.y - 6, width: 350, height: 80 } }); }
  await palette.getByRole('button', { name: 'Green highlight', exact: true }).click();
  assert.equal(await palette.count(), 0, 'the palette closes');
  assert.equal(await synonyms.locator('.md-toolbar [data-tool="highlight"]').getAttribute('data-colour'), 'green', 'the button keeps the colour');
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  assert.equal((await stored()).facets.synonyms, '[Böschung,]{size=large font=display highlight=green} **[fest]{size=large font=display highlight=green}**');
  assert.equal(await synonyms.locator('.facet-body mark.md-highlight-green').count(), 2);
  assert.equal(await synonyms.locator('.facet-body mark.md-highlight-green').first().evaluate(node => getComputedStyle(node).backgroundColor),
    await a.page.evaluate(() => { const probe = document.body.appendChild(Object.assign(document.createElement('i'), { style: 'background: var(--highlight-green)' }));
      const colour = getComputedStyle(probe).backgroundColor; probe.remove(); return colour; }), 'in the palette\'s green');
  await card.screenshot({ path: 'artifacts/v0.7.5-highlight-card.png' });

  // Emptied, the facet loses its content and leaves the card; its tag stays, bland.
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused again');
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.press('Backspace');
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  // Emptied, it keeps its heading, dimmed, with no text (D10, amended a sixth time). The editor's own
  // section is dimmed too while its text is empty, so the editor has to be closed first.
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  await waitFor(async () => await synonyms.getAttribute('data-unfilled') !== null, 'Synonyms emptied');
  assert.equal(await synonyms.locator('.facet-body').count(), 0);
  // Its heading keeps Edit, Retry and Delete; Edit fills it by hand; Delete goes at once, as there is nothing to lose.
  await synonyms.hover();
  assert.deepEqual(await synonyms.locator('.facet-actions button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
    ['About Synonyms from German', 'Edit Synonyms from German', 'Retry Synonyms from German', 'Delete Synonyms from German']);
  await synonyms.screenshot({ path: 'artifacts/v0.7.5-empty-facet.png' });
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused to fill');
  await a.page.keyboard.type('Ufer');
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  assert.equal((await stored()).facets.synonyms, 'Ufer', 'filled by hand');
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Edit Synonyms from German', exact: true }).click();
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Synonyms, German'), 'focused to empty');
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.press('Backspace');
  await synonyms.getByRole('button', { name: 'Save', exact: true }).click();
  await card.getByRole('textbox').waitFor({ state: 'detached' });
  await synonyms.hover();
  await a.page.getByRole('button', { name: 'Delete Synonyms from German', exact: true }).click();
  await synonyms.waitFor({ state: 'detached' });
  assert.equal(await card.locator('.facet-confirm').count(), 0, 'no "Are you sure?" for an empty facet');
  assert.equal((await stored()).facets.synonyms, undefined);
  assert.notEqual(await card.locator('.facet-tag[data-facet="synonyms"]').getAttribute('data-unfilled'), null);
});

test('0.7.5: Context and Text edit with the toolbar editor, from their tab', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-notes-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'notes', epoch: 1 };
  await store.openSession('notes-session', session);
  const { pageId } = await store.capture('notes-capture', { session, mainKey: 'bank', context: 'We sat by the bank, 2*3 times.', snapshot: await store.snapshot() });
  const context = async () => (await store.page(pageId)).components.find(item => item.moduleType === 'context');
  assert.equal(blockText((await context()).content), 'We sat by the ==bank==, 2\\*3 times.', 'captured as markdown, the main key highlighted');
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'Context');
  await card.locator('.note-body').waitFor();
  assert.equal(await card.locator('.note-body').textContent(), 'We sat by the bank, 2*3 times.', 'reads as captured');

  // No row of its own (D10, amended a fifth time): it is edited and deleted from its tab.
  assert.equal(await card.locator('.facet-actions').count(), 0);
  // Edit opens the same toolbar editor; the main key's highlight shows there.
  await (await cardButton(a.page, 'Edit Context')).click();
  const text = card.getByRole('textbox', { name: 'Edit Context', exact: true });
  await text.waitFor();
  await waitFor(() => a.page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Edit Context'), 'focused');
  assert.equal(await text.locator('mark').textContent(), 'bank');
  assert.equal(await card.locator('.md-toolbar').count(), 1);
  await a.page.keyboard.press('ControlOrMeta+a'); await a.page.waitForTimeout(300);
  await card.locator('.md-toolbar').getByRole('button', { name: 'Italic', exact: true }).click();
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await text.waitFor({ state: 'detached' });
  assert.match(blockText((await context()).content), /^\*We sat by the ==bank==, 2\\\*3 times\.\*$/);
  assert.equal(await card.locator('.note-body em').count() > 0, true, 'the card shows it formatted');

  // The tab's Delete asks first, then deletes the component.
  await (await cardButton(a.page, 'Delete Context')).click();
  await a.page.getByRole('button', { name: 'Yes, delete Context', exact: true }).click();
  await waitFor(async () => !(await context()), 'Context deleted');
});

test('0.7.5: an empty parent is written by hand: its top line the main key, the language blank, saved and shown', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-empty-parent-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1400 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'empty-parent', epoch: 1 };
  await store.openSession('empty-parent-session', session);
  const { pageId } = await store.capture('empty-parent-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const first = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  await store.stage(first.attemptId, staged('Ufer'));
  await store.publish('empty-parent-publish', { attemptId: first.attemptId, session });
  const { componentId } = await store.addModule('empty-parent-add', { pageId, type: 'german' });
  const written = async () => (await store.page(pageId)).components.find(item => item.id === componentId).content.blocks[0];
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German 2');
  await card.waitFor();
  assert.notEqual(await card.getAttribute('data-empty'), null, 'only its tab');

  // Edit opens it with a top line of the main key, the language blank, and an empty core to fill.
  await (await cardButton(a.page, 'Edit German 2')).click();
  const editor = card.getByRole('group', { name: 'Edit German 2', exact: true });
  await editor.waitFor();
  assert.equal(await editor.locator('.entry-heading-text').textContent(), 'bank');
  const core = editor.getByRole('textbox', { name: 'Meanings, German 2', exact: true });
  await core.click();
  await a.page.keyboard.type('Ufer am Fluss');
  await card.screenshot({ path: 'artifacts/v0.7.5-empty-parent-editor.png' });
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  assert.deepEqual(await written(), { type: 'parent', header: { kind: 'word', language: '', key: 'bank' }, core: 'Ufer am Fluss', facets: {} });
  await card.locator('.entry-core').waitFor();
  assert.equal(await card.getAttribute('data-empty'), null, 'a card with content now');
  assert.equal(await card.locator('.entry-core').textContent(), 'Ufer am Fluss');
});

test('0.8.0: an Expertise card, leaf green with a graduation cap, explains the key in English under a top line without a language', { timeout: 60000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-expertise-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1200 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'expertise', epoch: 1 };
  await store.openSession('expertise-session', session);
  const { pageId } = await store.createPage('expertise-page', { deckId: (await store.snapshot()).id, mainKey: 'Frontend' });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.getByRole('heading', { name: 'Frontend', exact: true }).first().waitFor();

  // The module window groups Computer Science and Mathematics under Expertise, with its mark.
  const window = a.page.locator('.module-window');
  const expertise = window.locator('details').filter({ has: a.page.locator('summary', { hasText: 'Expertise' }) });
  await expertise.locator('summary').click();
  assert.deepEqual(await expertise.locator('.window-module').evaluateAll(nodes => nodes.map(node => node.dataset.type)), ['computer-science', 'mathematics']);
  assert.equal(await expertise.locator('summary .fam-icon path').count(), 3, 'the graduation cap');
  await a.page.getByRole('button', { name: 'Add Computer Science at the end', exact: true }).click();
  const card = componentArticle(a.page, 'Computer Science');
  await card.waitFor();
  assert.match(await card.getAttribute('class'), /fam-expertise/);

  // Generated: the key on the top line, no language, and the explanation in paragraphs.
  const component = (await store.page(pageId)).components.find(item => item.moduleType === 'computer-science');
  const { attemptIds: [attemptId] } = await store.generate('expertise-generate', { pageId, target: { scope: 'component', componentId: component.id }, session });
  await store.stage(attemptId, staged(formatContent('computer-science', { core: { relevance: 'subject', key: 'Frontend',
    explanation: ['The part of a program that people see and touch.', 'Think of a restaurant: the frontend is the dining room.'] }, facets: {} })));
  await store.publish('expertise-publish', { attemptId, session });
  await a.page.reload();
  await card.locator('.entry-core').waitFor();
  assert.equal(await card.locator('.entry-heading .entry-key').textContent(), 'Frontend');
  assert.equal(await card.locator('.entry-heading .entry-language').count(), 0, 'an Expertise core names no language');
  assert.deepEqual(await card.locator('.entry-core p').allTextContents(), ['The part of a program that people see and touch.', 'Think of a restaurant: the frontend is the dining room.']);
  const colours = await card.locator('.card-tab').first().evaluate(node => [getComputedStyle(node).backgroundColor, getComputedStyle(node).color]);
  assert.deepEqual(colours, ['rgb(70, 110, 18)', 'rgb(255, 255, 255)'], 'leaf green with a white label in the light theme');
  await a.page.screenshot({ path: 'artifacts/v0.8.0-expertise-card.png', fullPage: true });
});

test('0.9.0: Language in the account menu is the account’s preference, English by default, and another installation’s choice follows (D14)', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-language-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const documentLanguage = () => a.page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]);
  // Signed out there is no account, so no Language; the interface is English.
  assert.deepEqual(await documentLanguage(), ['en', 'ltr']);
  assert.equal(await a.page.getByRole('button', { name: /^Language/ }).count(), 0);
  await signIn(a.page);
  // The account menu's Language row shows the current language and opens the list in the menu.
  await accountMenu(a.page);
  const row = a.page.getByRole('button', { name: 'Language, English', exact: true });
  await a.page.locator('.account-panel').screenshot({ path: 'artifacts/v0.9.0-account-menu-light.png' });
  await row.click();
  const list = a.page.getByRole('group', { name: 'Language', exact: true });
  await list.waitFor();
  assert.equal(await row.isVisible(), false, 'the list takes the menu’s place');
  const choices = list.locator('.language-choice');
  assert.deepEqual(await choices.evaluateAll(nodes => nodes.map(node => [node.dataset.language, node.getAttribute('aria-pressed'), node.disabled])), [
    ['en', 'true', false], ['ar', 'false', false], ['zh-Hans', 'false', false], ['fr', 'false', false], ['ru', 'false', false], ['es', 'false', false]
  ], 'every language listed in its own name; each is reviewed, so each can be picked');
  assert.equal(await list.getByRole('button', { name: 'Français', exact: true }).isDisabled(), false);
  assert.equal(await list.locator('[data-language="ar"] .language-name').getAttribute('dir'), 'rtl');
  assert.equal(await a.page.evaluate(() => document.activeElement?.dataset.language), 'en', 'the focus moves to the first language that can be picked');
  for (const theme of ['light', 'dark']) {
    await a.page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await a.page.locator('.account-panel').screenshot({ path: `artifacts/v0.9.0-language-list-${theme}.png` });
  }
  await a.page.evaluate(() => { delete document.documentElement.dataset.theme; });
  // Back returns to the menu with the focus on Language; picking the current language closes the menu.
  await list.getByRole('button', { name: 'Back to the account menu', exact: true }).click();
  assert.equal(await a.page.evaluate(() => document.activeElement?.classList.contains('language-row')), true);
  await row.click();
  await list.locator('[data-language="en"]').click();
  assert.equal(await a.page.locator('.account-panel').isVisible(), false);
  // The worker saves the preference to the account and returns the refreshed account.
  const saved = await a.page.evaluate(() => chrome.runtime.sendMessage({ type: 'set-language', language: 'en' }));
  assert.equal(saved.account.language, 'en');
  assert.equal((await application.store.summary()).language, 'en');
  const rejected = await a.page.evaluate(() => chrome.runtime.sendMessage({ type: 'set-language', language: 'de' }));
  assert.equal(rejected.code, 'invalid');
  // Another installation chooses French: this one follows after its next refresh, without a reload, and keeps it after one.
  await application.store.setLanguage('remote-french', 'fr');
  await a.page.getByRole('heading', { name: 'Vos paquets', exact: true }).waitFor({ timeout: 15000 });
  assert.deepEqual(await documentLanguage(), ['fr', 'ltr']);
  await a.page.locator('.account-trigger').click();
  await a.page.getByRole('button', { name: 'Langue, Français', exact: true }).waitFor();
  await a.page.reload();
  await a.page.getByRole('heading', { name: 'Vos paquets', exact: true }).waitFor();
  assert.deepEqual(await documentLanguage(), ['fr', 'ltr']);
});

// Text an interface shows that is not its own: the brand, the user's decks,
// keys and content, dates, counts, and the languages named in themselves.
const NOT_INTERFACE = '.brand, .meaning, .main-key, .entry, .md, .entry-content, .capture-text, .nav-label, .nav-count, .deck h2, .deck-view h1 bdi, .capture-deck, time, .family-count, .language-name, .language-row-value, .facet-tab-mark, .facet-tag-mark, .sample-page, .explanation-samples, .facet-explanation .explanation-sample, input, textarea';
// Every visible interface text and label that is not a pseudo-language message.
const unaccented = page => page.evaluate(selector => {
  const found = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    const text = node.textContent.trim();
    if (!element || !/\p{L}{2}/u.test(text) || element.closest(selector) || !element.checkVisibility()) continue;
    if (!/[⟦⟧]/.test(text)) found.push(text);
  }
  for (const element of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
    if (element.closest(selector) && !element.matches('input, textarea') || !element.checkVisibility()) continue;
    for (const name of ['aria-label', 'title', 'placeholder']) {
      const value = element.getAttribute(name);
      if (value && /\p{L}{2}/u.test(value) && !/[⟦⟧]/.test(value)) found.push(`${name}=${value}`);
    }
  }
  return [...new Set(found)];
}, NOT_INTERFACE);

test('0.9.0: right to left and the pseudo-languages: every surface mirrors, content keeps its direction, and no interface text escapes the catalogue (D14)', { timeout: 90000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-rtl-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1000 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'rtl', epoch: 1 };
  await store.openSession('rtl-session', session);
  const { pageId } = await store.capture('rtl-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const [german] = (await store.page(pageId)).components.filter(item => item.moduleType === 'german');
  await store.stage(german.attemptId, staged(BANK));
  await store.publish('rtl-publish', { attemptId: german.attemptId, session });
  await signIn(a.page);
  const pseudo = value => a.page.evaluate(language => language ? chrome.storage.local.set({ pseudoLanguage: language }) : chrome.storage.local.remove('pseudoLanguage'), value);
  const box = locator => locator.evaluate(node => { const { left, right, top, bottom } = node.getBoundingClientRect(); return { left, right, top, bottom }; });
  // A card is shot with the row above it, where its tab and question stand.
  const shoot = async (name, locator) => {
    for (const theme of ['light', 'dark']) {
      await a.page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const path = `artifacts/v0.9.0-${name}-${theme}.png`;
      if (!locator) await a.page.screenshot({ path });
      else { const area = await box(locator); await a.page.screenshot({ path, clip: { x: area.left - 40, y: area.top - 40, width: area.right - area.left + 80, height: Math.min(700, area.bottom - area.top + 80) } }); }
    }
    await a.page.evaluate(() => { delete document.documentElement.dataset.theme; });
  };

  // Right to left (ar-XB): the document and every surface mirror.
  await pseudo('ar-XB');
  await a.page.waitForFunction(() => document.documentElement.dir === 'rtl');
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  const sidebar = await box(a.page.locator('#sidebar')), main = await box(a.page.locator('#app'));
  assert.ok(sidebar.left > main.left, 'the sidebar stands at the right');
  await accountMenu(a.page);
  const trigger = await box(a.page.getByRole('button', { name: 'Account', exact: true })), panel = await box(a.page.locator('.account-panel'));
  assert.ok(Math.abs(panel.left - trigger.left) < 2, 'the account menu opens towards the reading end, from the trigger’s left edge');
  await a.page.keyboard.press('Escape');
  await shoot('rtl-dashboard');

  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  await card.waitFor();
  const cardBox = await box(card), tab = await box(card.locator('.card-tab')), tags = await box(card.locator('.facet-tags'));
  assert.ok(cardBox.right - tab.right < 40 && tab.left - cardBox.left > 100, 'the card’s tab sits at its right');
  assert.ok(tags.left > cardBox.right - 12, 'the facet tags stick out of the card’s right edge');
  assert.equal(await card.locator('.md p, .md ol').first().evaluate(node => getComputedStyle(node).direction), 'ltr', 'German content keeps its own direction');
  assert.equal(await a.page.locator('h1.main-key').evaluate(node => getComputedStyle(node).direction), 'ltr', 'so does a Latin main key');
  const windowBox = await box(a.page.locator('.module-window'));
  assert.ok(windowBox.right < cardBox.left, 'the module window stands at the left of the page');
  await shoot('rtl-page');
  // A card's actions spring out from its tab towards the reading end, and Delete asks beside it.
  await cardTab(a.page, 'German').click();
  const actions = card.locator('.card-actions');
  await actions.getByRole('button', { name: 'Delete German', exact: true }).click();
  await actions.getByText('Are you sure?', { exact: true }).waitFor();
  const question = await box(actions.locator('.confirm-text')), cancel = await box(actions.getByRole('button', { name: 'Keep German', exact: true }));
  assert.ok(question.right <= cancel.left + 1, 'the question stands after Cancel in the reading order, at its left');
  await a.page.waitForTimeout(700);
  await shoot('rtl-card-question', card);
  await actions.getByRole('button', { name: 'Keep German', exact: true }).click();
  await actions.getByRole('button', { name: 'Facets of German', exact: true }).click();
  const window = a.page.getByRole('group', { name: 'Facets of German', exact: true });
  await window.waitFor();
  await a.page.waitForTimeout(300);
  await shoot('rtl-facet-window', card);
  await a.page.keyboard.press('Escape');
  await window.waitFor({ state: 'detached' });
  // Keyboard reordering still moves a module, the arrows following the reading direction.
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${(await store.snapshot()).id}`);
  await a.page.getByRole('heading', { name: 'Modules for new pages', exact: true }).waitFor();
  await shoot('rtl-deck-settings');

  // The accented pseudo-language (en-XA): no visible interface text or label is left in plain English.
  await pseudo('en-XA');
  await a.page.waitForFunction(() => document.documentElement.lang === 'en-XA' && document.documentElement.dir === 'ltr');
  await a.page.goto(`chrome-extension://${a.id}/app.html`);
  await a.page.locator('.recent').waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'dashboard');
  await a.page.locator('.account-trigger').click();
  await a.page.locator('.account-panel').waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'account menu');
  await a.page.locator('.language-row').click();
  assert.deepEqual(await unaccented(a.page), [], 'language list');
  await a.page.keyboard.press('Escape');
  await a.page.locator('.deck .open').first().click();
  await a.page.locator('.page-row').first().waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'deck page list');
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.locator('article.component[data-type="german"]').waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'page');
  await a.page.locator('article.component[data-type="german"] .tab-button').click();
  assert.deepEqual(await unaccented(a.page), [], 'card actions');
  await shoot('pseudo-page');
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${(await store.snapshot()).id}`);
  await a.page.locator('.module-window').waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'deck settings');
  await a.page.goto(`chrome-extension://${a.id}/app.html#diagnostics`);
  await a.page.locator('section h1').waitFor();
  assert.deepEqual(await unaccented(a.page), [], 'diagnostic logs');

  // Without a pseudo-language the interface is the account's English again.
  await pseudo(null);
  await a.page.waitForFunction(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr');
});

test('0.9.0: the interface in each language: picked from Language, saved to the account, with its names, explanations and direction (D14)', { timeout: 120000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-languages-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await a.page.setViewportSize({ width: 1280, height: 1000 });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'languages', epoch: 1 };
  await store.openSession('languages-session', session);
  const { pageId } = await store.capture('languages-capture', { session, mainKey: 'bank', snapshot: await store.snapshot() });
  const [german] = (await store.page(pageId)).components.filter(item => item.moduleType === 'german');
  await store.stage(german.attemptId, staged(BANK));
  await store.publish('languages-publish', { attemptId: german.attemptId, session });
  const catalogue = async code => JSON.parse(await readFile(`extension/locales/${code}/messages.json`, 'utf8'));
  const english = await catalogue('en');
  await signIn(a.page);

  // Picked from the account menu's Language list, French applies at once, without a reload.
  const french = await catalogue('fr');
  await accountMenu(a.page);
  await a.page.getByRole('button', { name: 'Language, English', exact: true }).click();
  await a.page.locator('.language-choice[data-language="fr"]').click();
  await a.page.getByRole('heading', { name: french['dashboard.title'], exact: true }).waitFor();
  assert.equal((await store.summary()).language, 'fr');
  assert.deepEqual(await a.page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), ['fr', 'ltr']);

  for (const code of ['fr', 'es', 'ru', 'zh-Hans', 'ar']) {
    const messages = await catalogue(code);
    await store.setLanguage(`language-${code}`, code);
    await a.page.goto(`chrome-extension://${a.id}/app.html`);
    await a.page.getByRole('heading', { name: messages['dashboard.title'], exact: true }).waitFor({ timeout: 15000 });
    assert.deepEqual(await a.page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), [code, code === 'ar' ? 'rtl' : 'ltr']);
    await a.page.screenshot({ path: `artifacts/v0.9.0-${code}-dashboard-light.png` });
    // A page: the module's name, its facets' names, in the language; the facet marks as the catalog gives them.
    await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
    const card = a.page.locator('article.component[data-type="german"]');
    await card.waitFor();
    assert.equal(await card.locator('.card-tab .tab-label').innerText(), messages['catalog.german.label']);
    assert.equal(await card.locator('.facet[data-facet="article"] .facet-tab-label').innerText(), messages['catalog.german.article.label']);
    assert.deepEqual(await card.locator('.facet-tag-mark').allInnerTexts(), ['Ar', 'Ex', 'Sy', 'An']);
    assert.equal(await a.page.locator('h1.main-key').evaluate(node => getComputedStyle(node).direction), 'ltr', 'a Latin main key keeps its direction');
    await a.page.screenshot({ path: `artifacts/v0.9.0-${code}-page-light.png` });
    // About German opens its page in the language (D20).
    const about = a.page.locator('.window-module[data-type="german"] .window-about');
    await openFamily(about);
    await about.click();
    const summary = JSON.parse(await readFile(`packages/domain/src/catalog/languages/german/about.${code}.json`, 'utf8')).summary;
    const dialog = a.page.locator('dialog.about-sheet');
    await dialog.waitFor();
    assert.equal(await dialog.locator('.about-lede').innerText(), summary, `${code}: the page is in the language`);
    await dialog.screenshot({ path: `artifacts/v0.9.0-${code}-about-light.png` });
    await a.page.keyboard.press('Escape');
    assert.notEqual(messages['dashboard.title'], english['dashboard.title']);
  }

  // Arabic in both themes, with forced colours off and on: the page and the Language list stay
  // outlined and readable, right to left (0.9.0 increment D).
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.locator('article.component[data-type="german"]').waitFor();
  await a.page.locator('.account-trigger').click();
  await a.page.locator('.language-row').click();
  const panel = a.page.locator('.account-panel');
  for (const colorScheme of ['light', 'dark']) for (const forcedColors of ['none', 'active']) {
    await a.page.emulateMedia({ colorScheme, forcedColors });
    const name = `${colorScheme}${forcedColors === 'active' ? '-forced' : ''}`;
    const edge = await panel.evaluate(node => { const style = getComputedStyle(node); return { border: style.borderTopStyle, shadow: style.boxShadow }; });
    assert.ok(forcedColors === 'active' ? edge.border === 'solid' : edge.shadow !== 'none', `${name}: the account menu is outlined (${JSON.stringify(edge)})`);
    assert.equal(await a.page.evaluate(() => document.documentElement.dir), 'rtl');
    await a.page.screenshot({ path: `artifacts/v0.9.0-ar-language-${name}.png`, animations: 'disabled' });
  }
  await a.page.emulateMedia({ colorScheme: 'light', forcedColors: 'none' });
  await a.page.keyboard.press('Escape');

  // Back to English from the list, which names every language in itself, all of them offered.
  await a.page.goto(`chrome-extension://${a.id}/app.html`);
  await a.page.locator('.account-trigger').click();
  await a.page.locator('.language-row').click();
  assert.deepEqual(await a.page.locator('.language-choice').evaluateAll(nodes => nodes.map(node => [node.dataset.language, node.disabled])),
    [['en', false], ['ar', false], ['zh-Hans', false], ['fr', false], ['ru', false], ['es', false]]);
  await a.page.locator('.language-choice[data-language="en"]').click();
  await a.page.getByRole('heading', { name: 'Your decks', exact: true }).waitFor();
  assert.equal((await store.summary()).language, 'en');
});

test('0.9.1: deleting a page goes straight to its deck, and an ejected action stays lifted under a pointer at its lower edge', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-0-9-1-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['german']);
  const session = { installationId: 'fixture', sessionId: 'fix-0-9-1', epoch: 1 };
  await store.openSession('fix-0-9-1-session', session);
  const { pageId } = await store.capture('fix-0-9-1-page', { session, mainKey: 'Glück', snapshot: await store.snapshot() });
  for (const item of (await store.page(pageId)).components.filter(component => component.attemptId)) {
    await store.stage(item.attemptId, staged('Freude'));
    await store.publish(`fix-0-9-1-${item.id}`, { attemptId: item.attemptId, session });
  }
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await a.page.locator('h1.main-key').waitFor();
  // Lifting on hover moved the action off a pointer at its lower edge, which
  // dropped it under the pointer again: it flickered with every move.
  await cardTab(a.page, 'German').click();
  const action = a.page.locator('.card-actions[data-open] button').first();
  await action.waitFor();
  await new Promise(resolve => setTimeout(resolve, 800));
  const box = await action.boundingBox();
  let hovered = '';
  for (let step = 0; step < 20; step++) {
    await a.page.mouse.move(box.x + box.width / 2 + step % 2, box.y + box.height - 1);
    await new Promise(resolve => setTimeout(resolve, 60));
    hovered += await action.evaluate(button => button.matches(':hover') ? 'H' : '.');
  }
  assert.equal(hovered, 'H'.repeat(20), 'the action stays hovered at its lower edge');
  await a.page.keyboard.press('Escape');
  // Every heading the view shows from Delete to the deck: never Page unavailable in between.
  await a.page.evaluate(() => {
    window.headings = [];
    new MutationObserver(() => window.headings.push(document.querySelector('#app h1')?.textContent))
      .observe(document.querySelector('#app'), { childList: true, subtree: true, characterData: true });
  });
  await a.page.getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('heading', { name: 'My Deck' }).waitFor();
  await new Promise(resolve => setTimeout(resolve, 500));
  const headings = [...new Set(await a.page.evaluate(() => window.headings))];
  assert.ok(!headings.includes('Page unavailable'), `no unavailable page on the way to the deck (${JSON.stringify(headings)})`);
});

test('0.12.0: a German verb’s Conjugation is a table on the card, its top line says Verb, and its own Edit edits the table as its source (D17)', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-grammar-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'grammar', epoch: 1 };
  await store.openSession('grammar-session', session);
  await useModules(store, ['german']);
  const { pageId } = await store.capture('grammar-capture', { session, mainKey: 'laufen', snapshot: await store.snapshot() });
  const german = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  const conjugation = { columns: ['Präsens', 'Präteritum', 'Perfekt'], rows: [
    { label: 'ich', cells: ['laufe', 'lief', 'bin gelaufen'] }, { label: 'du', cells: ['läufst', 'liefst', 'bist gelaufen'] }] };
  // A verb: Article and Declension would be dropped by the facet check, so the model's are left out here.
  await store.stage(german.attemptId, staged({ core: { kind: 'word', language: 'Deutsch', key: 'laufen', gramRole: 'verb', meanings: ['sich zu Fuß fortbewegen'] },
    facets: { examples: [{ sentence: 'Wir laufen.' }], conjugation } }));
  await store.publish('grammar-publish', { attemptId: german.attemptId, session });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  const facet = card.locator('.facet[data-facet="conjugation"]');
  await facet.locator('table').waitFor();

  assert.deepEqual(await card.locator('.entry-heading .entry-label').allTextContents(), ['Wort', 'Verb']);
  assert.deepEqual(await facet.locator('thead th').allTextContents(), ['', 'Präsens', 'Präteritum', 'Perfekt']);
  assert.deepEqual(await facet.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent))),
    [['ich', 'laufe', 'lief', 'bin gelaufen'], ['du', 'läufst', 'liefst', 'bist gelaufen']]);
  assert.equal(await facet.locator('tbody th[scope="row"]').count(), 2, 'each row is labelled by its person');
  await card.screenshot({ path: 'artifacts/v0.12.0-conjugation.png' });
  // A facet the verb rules out shows no note; its Retry stays, unavailable, on its heading and its tag (0.12.1).
  const declension = card.locator('.facet[data-facet="declension"]');
  assert.equal(await card.locator('.facet-note[data-note="ruled-out"]').count(), 0);
  await declension.hover();
  assert.equal(await a.page.getByRole('button', { name: 'Retry Declension from German', exact: true }).isDisabled(), true);
  await card.screenshot({ path: 'artifacts/v0.12.1-retry-unavailable.png', animations: 'disabled' });
  assert.equal(await card.locator('.facet-tag[data-facet="declension"] .facet-tag-retry').isDisabled(), true);
  assert.equal(await a.page.getByRole('button', { name: 'Retry Conjugation from German', exact: true }).isDisabled(), false, 'Conjugation applies');
  // Its About opens the facet's page, as its › in the facet window does (0.12.1; a page since 0.13.0).
  await a.page.getByRole('button', { name: 'About Conjugation from German', exact: true }).click();
  const conjugationAbout = a.page.getByRole('dialog', { name: 'Conjugation', exact: true });
  await conjugationAbout.waitFor();
  await a.page.screenshot({ path: 'artifacts/v0.12.1-facet-about.png', animations: 'disabled' });
  assert.equal(await conjugationAbout.locator('.about-applies').innerText(), 'Verbs');
  await a.page.keyboard.press('Escape');
  await conjugationAbout.waitFor({ state: 'detached' });

  // Its own Edit opens the table's source, a row a line; a change shows on the card after Save.
  await facet.hover();
  await a.page.getByRole('button', { name: 'Edit Conjugation from German', exact: true }).click();
  const source = card.getByRole('textbox', { name: 'Conjugation, German', exact: true });
  await source.waitFor();
  assert.equal(await source.evaluate(node => node.tagName), 'TEXTAREA');
  assert.match(await source.inputValue(), /^\|  \| Präsens \| Präteritum \| Perfekt \|\n\| --- \|/);
  await source.fill((await source.inputValue()).replace('läufst', 'rennst'));
  await facet.getByRole('button', { name: 'Save', exact: true }).click();
  await waitFor(async () => (await facet.locator('tbody tr').nth(1).locator('td').first().textContent()) === 'rennst', 'the edited table shows');
  const stored = (await store.page(pageId)).components.find(item => item.moduleType === 'german').content.blocks[0].facets.conjugation;
  assert.match(stored, /\| du \| rennst \| liefst \| bist gelaufen \|/);
});

test('0.12.0: a Formula renders with KaTeX, a broken one shows its LaTeX, and a Code example is highlighted and edited as its source (D17)', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-formula-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'formula', epoch: 1 };
  await store.openSession('formula-session', session);
  await useModules(store, ['mathematics', 'computer-science']);
  const { pageId } = await store.capture('formula-capture', { session, mainKey: 'eigenvalue', snapshot: await store.snapshot() });
  const [math, cs] = (await store.page(pageId)).components.filter(item => ['mathematics', 'computer-science'].includes(item.moduleType));
  await store.stage(math.attemptId, staged(formatContent('mathematics', { core: { relevance: 'subject', hasFormula: 'yes', key: 'eigenvalue', explanation: ['A stretch factor.'] },
    facets: { formula: { latex: 'A\\mathbf{v} = \\lambda \\mathbf{v}', symbols: [{ symbol: '\\lambda', meaning: 'the eigenvalue' }] } } })));
  await store.publish('formula-publish', { attemptId: math.attemptId, session });
  await store.stage(cs.attemptId, staged(formatContent('computer-science', { core: { relevance: 'subject', hasCode: 'yes', key: 'eigenvalue', explanation: ['Computed numerically.'] },
    facets: { code: { language: 'python', code: 'import numpy as np\n# the eigenvalues of a matrix\nvalues = np.linalg.eigvals([[2, 0], [0, 3]])' } } })));
  await store.publish('code-publish', { attemptId: cs.attemptId, session });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);

  const formula = componentArticle(a.page, 'Mathematics').locator('.facet[data-facet="formula"]');
  await formula.locator('.md-math .katex-display').waitFor();
  assert.ok(await formula.locator('.md-math .katex-mathml math').count() === 1, 'KaTeX writes MathML for assistive technology');
  assert.equal(await formula.locator('li .md-math-inline .katex').count(), 1, 'the symbol is inline math');
  assert.match(await formula.locator('li').textContent(), /the eigenvalue/);
  const fonts = await a.page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(font => font.family.includes('KaTeX') && font.status === 'loaded').length; });
  assert.ok(fonts > 0, 'KaTeX’s fonts load from the extension');

  const code = componentArticle(a.page, 'Computer Science').locator('.facet[data-facet="code"]');
  await code.locator('pre.md-code[data-language="python"] .hljs-keyword').first().waitFor();
  assert.equal(await code.locator('pre.md-code code').textContent(), 'import numpy as np\n# the eigenvalues of a matrix\nvalues = np.linalg.eigvals([[2, 0], [0, 3]])');
  assert.equal(await code.locator('.hljs-comment').textContent(), '# the eigenvalues of a matrix');
  await componentArticle(a.page, 'Mathematics').screenshot({ path: 'artifacts/v0.12.0-formula.png' });
  await componentArticle(a.page, 'Computer Science').screenshot({ path: 'artifacts/v0.12.0-code.png' });

  // A formula KaTeX cannot read shows its source; the Formula's own Edit edits it as source.
  await formula.hover();
  await a.page.getByRole('button', { name: 'Edit Formula from Mathematics', exact: true }).click();
  const source = componentArticle(a.page, 'Mathematics').getByRole('textbox', { name: 'Formula, Mathematics', exact: true });
  await source.waitFor();
  assert.equal(await source.evaluate(node => node.tagName), 'TEXTAREA');
  await source.fill((await source.inputValue()).replace('A\\mathbf{v} = \\lambda \\mathbf{v}', '\\frac{1}{'));
  await formula.getByRole('button', { name: 'Save', exact: true }).click();
  await formula.locator('pre.md-math-source').waitFor();
  assert.equal(await formula.locator('pre.md-math-source').textContent(), '\\frac{1}{');
});

test('0.12.2: a card’s Retry gives the model the core it had, with the meanings as the user edited them (D19)', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-reading-browser-'));
  const requests = [];
  const bench = { core: { kind: 'word', language: 'Deutsch', key: 'Bank', gramRole: 'noun', meanings: ['Sitzbank'] }, facets: {} };
  const application = await createTestApplication(t, { provider: { generate: async request => { requests.push(request); return bench; } } });
  await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  const session = { installationId: 'fixture', sessionId: 'reading', epoch: 1 };
  await store.openSession('reading-session', session);
  await useModules(store, ['german']);
  const { pageId } = await store.capture('reading-capture', { session, mainKey: 'Bank', snapshot: await store.snapshot() });
  const german = (await store.page(pageId)).components.find(item => item.moduleType === 'german');
  // The first reading took Bank as a place to keep money.
  await store.stage(german.attemptId, staged({ core: { kind: 'word', language: 'Deutsch', key: 'Bank', gramRole: 'noun', meanings: ['Geldinstitut'] }, facets: {} }));
  await store.publish('reading-publish', { attemptId: german.attemptId, session });
  await signIn(a.page);
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  const card = componentArticle(a.page, 'German');
  await card.locator('.entry-core').waitFor();
  // The user corrects the reading in the meanings, then retries the card.
  await (await cardButton(a.page, 'Edit German')).click();
  const meanings = a.page.getByRole('textbox', { name: 'Meanings, German', exact: true });
  await meanings.click(); await a.page.keyboard.press('ControlOrMeta+a'); await a.page.keyboard.type('Sitzgelegenheit für mehrere');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.locator('.component-tools').waitFor({ state: 'detached' });
  await (await cardButton(a.page, 'Retry German')).click();
  await a.page.getByRole('button', { name: 'Yes, retry German', exact: true }).click();
  await waitFor(() => requests.length === 1, 'the Retry reached the provider');
  assert.deepEqual(requests[0].previous, { kind: 'word', language: 'Deutsch', key: 'Bank', gramRole: 'noun', meanings: ['Sitzgelegenheit für mehrere'] },
    'the core as saved, with the edited meanings');
  assert.equal(requests[0].core, undefined);
  await card.locator('.entry-core', { hasText: 'Sitzbank' }).waitFor();
});
