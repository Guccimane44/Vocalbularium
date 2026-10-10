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
const componentArticle = (page, heading) => page.locator('article.component').filter({ has: page.getByRole('heading', { name: heading }) });
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
async function signIn(page) {
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your decks.' }).waitFor();
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
  await a.page.locator('article').filter({ hasText: 'Second deck' }).getByText('DEFAULT DECK', { exact: true }).waitFor();
  assert.equal((await application.store.account()).defaultDeckId, second.id);
  await b.page.reload();
  await b.page.locator('article').filter({ hasText: 'Second deck' }).getByText('DEFAULT DECK', { exact: true }).waitFor();

  await a.context.close(); contexts.delete(a.context);
  a = await launch(aProfile); contexts.add(a.context);
  await a.page.getByRole('heading', { name: 'Your decks.' }).waitFor();
  assert.equal((await application.store.account()).decks.length, 2);
  await a.page.getByRole('button', { name: 'Log out', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await a.page.reload();
  await a.page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await b.page.reload();
  await b.page.getByRole('heading', { name: 'Your decks.' }).waitFor();
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
  await browser.page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await browser.page.getByLabel('Edit Main key', { exact: true }).fill('draft survives expired access');
  const auth = await browser.worker.evaluate(async () => (await chrome.storage.local.get('auth')).auth);
  await application.authentication.logout(auth.token);
  await browser.page.getByRole('button', { name: 'Save', exact: true }).click();
  await browser.page.getByRole('alert').filter({ hasText: 'Sign in to continue.' }).waitFor();
  assert.equal(await browser.page.getByLabel('Edit Main key', { exact: true }).inputValue(), 'draft survives expired access');
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
  await waitFor(async () => await b.page.getByRole('button', { name: 'Open page', exact: true }).count() === 2, 'second installation synchronized duplicate captures');
  assert.equal(await b.page.getByRole('button', { name: 'Open page', exact: true }).count(), 2);
  await b.page.getByRole('button', { name: 'Open page', exact: true }).first().click();
  // Generated content is plain text in its own component.
  await componentArticle(b.page, '<German explanation + examples>').locator('pre').filter({ hasText: '=== Bedeutungen ===' }).waitFor();

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
  await a.page.getByRole('heading', { name: 'Your decks.' }).waitFor();
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
  assert.equal(await row.getAttribute('data-state'), 'loading');
  holdAccounts = false; for (const resume of heldAccounts.splice(0)) resume();
  await capture;
  await row.getByRole('button', { name: 'Open page', exact: true }).waitFor();
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
  assert.equal(await a.page.locator('.module-block').count(), 3, 'a new deck starts with the main key, Context and the German explanation');
  await a.page.locator('.module-block.pinned').getByText('Main key').waitFor();
  await a.page.getByRole('button', { name: 'Add <Sentence usage>', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add <German explanation>', exact: true }).click();
  await a.page.getByRole('button', { name: 'Move <German explanation> up', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add <Sentence usage>', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add <Sentence usage>', exact: true }).click();
  assert.equal(await a.page.locator('.module-block').count(), 7);
  assert.equal(await a.page.locator('.module-window .window-module').count(), 5, 'the window offers Context, Text and the three content modules');
  assert.equal(await a.page.getByRole('button', { name: 'Add Context', exact: true }).isDisabled(), true, 'one Context per deck');
  await a.page.getByText('There is already a Context.').waitFor();
  await a.page.getByLabel('Sample input', { exact: true }).selectOption('sentence');
  assert.equal(await a.page.locator('.preview').count(), 7, 'one preview per module, the main key included');
  assert.match(await a.page.locator('.preview').nth(0).textContent(), /我真的很幸福/);
  assert.match(await a.page.locator('.preview').nth(2).textContent(), /Does not apply to this input/);
  assert.match(await a.page.locator('.preview').nth(4).textContent(), /我真的很幸福/);
  assert.equal((await application.store.pages()).length, 0); assert.equal((await application.store.account()).decks.length, 1);
  await a.page.screenshot({ path: 'artifacts/m3-configuration.png', fullPage: true });
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor();
  const created = (await application.store.account()).decks.find(deck => deck.name === 'Everyday Chinese');
  assert.deepEqual(created.modules.map(module => module.type),
    ['main-key', 'context', 'german-examples', 'german-explanation', 'sentence-usage', 'sentence-usage', 'sentence-usage']);
  await a.page.getByLabel('Options for Everyday Chinese').click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByRole('button', { name: 'Set as default', exact: true }).click();
  await a.page.locator('article.deck').filter({ hasText: 'Everyday Chinese' }).getByText('DEFAULT DECK', { exact: true }).waitFor();
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
  await a.page.getByRole('button', { name: 'Remove <German explanation + examples>', exact: true }).click();
  for (let count = 6; count < 12; count++) await a.page.getByRole('button', { name: 'Add <Sentence usage>', exact: true }).click();
  assert.equal(await a.page.locator('.module-block').count(), 12);
  assert.equal(await a.page.locator('.module-window button:enabled').count(), 0, 'the window is closed at twelve modules');
  await a.page.getByText('At most 12 modules, including the main key.').first().waitFor();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Everyday Chinese', exact: true }).waitFor();
  assert.equal(await a.page.getByRole('dialog').count(), 0, 'changing the deck needs no content-loss confirmation');
  assert.deepEqual((await application.store.page(pageId)).components.map(item => [item.moduleType, text(item)]), before, 'deck changes never reach an existing page');
  await a.page.goto(`chrome-extension://${a.id}/app.html#page/${pageId}`);
  await componentArticle(a.page, '<German explanation + examples>').getByText('Saved explanation').waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Generate missing', exact: true }).count(), 0);
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
  await a.page.getByRole('heading', { name: 'Your decks.' }).waitFor();
  assert.equal((await application.store.account()).decks.length, 1);
  await a.page.getByRole('heading', { name: 'My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).waitFor();
  const original = (await application.store.snapshot()).id;
  await a.page.getByLabel('Options for My Deck').click();
  await a.page.getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('dialog').getByText(/A new empty My Deck will replace it/).waitFor();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete deck', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Your decks.' }).waitFor();
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
  const theme = (page, value) => page.getByLabel('Appearance', { exact: true }).selectOption(value);
  const hasTheme = (page, value) => page.waitForFunction(value => document.documentElement.dataset.theme === value, value);
  await hasTheme(a.page, 'light');
  await theme(a.page, 'dark');
  await a.page.screenshot({ path: 'artifacts/v0.2.0-login-dark.png', fullPage: true });
  await signIn(a.page);
  await hasTheme(a.page, 'dark'); await hasTheme(b.page, 'light');
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
  await a.page.getByRole('button', { name: 'Log out', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Welcome back.' }).waitFor(); await hasTheme(a.page, 'dark');
  await a.context.close();
  a = await launch(join(directory, 'a'), testingExtension);
  await hasTheme(a.page, 'dark'); await signIn(a.page); await hasTheme(a.page, 'dark');
  await a.page.getByRole('button', { name: 'Add new deck', exact: true }).click();
  await a.page.getByLabel('Deck name', { exact: true }).fill('Unsaved configuration');
  await a.page.getByRole('button', { name: 'Add <Sentence usage>', exact: true }).click();
  for (const appearance of ['dark', 'light']) {
    await theme(a.page, appearance);
    assert.equal(await a.page.getByLabel('Deck name', { exact: true }).inputValue(), 'Unsaved configuration');
    assert.equal(await a.page.locator('.module-block').count(), 4);
    await a.page.screenshot({ path: `artifacts/v0.2.0-configuration-${appearance}.png`, fullPage: true });
  }
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('page rows: accessible states, sorting, every pointer target, text selection and keyboard navigation', { timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-rows-browser-'));
  const application = await createTestApplication(t); await application.start();
  const a = await launch(join(directory, 'a'));
  t.after(async () => { await a.context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  const store = application.store;
  await useModules(store, ['sentence-usage', 'german-examples']);
  const deck = await store.snapshot();
  const session = { installationId: 'fixture', sessionId: 'rows', epoch: 1 };
  await store.openSession('rows-session', session);
  const ids = {};
  for (const state of ['completed', 'loading', 'failed']) {
    const { pageId } = await store.capture(`row-${state}`, { session, mainKey: `${state} entry`, snapshot: deck }); ids[state] = pageId;
    const [front, back] = modulesOf(await store.page(pageId));
    await store.stage(front.attemptId, { ok: true, text: `${state} entry` });
    await store.publish(`row-front-${state}`, { attemptId: front.attemptId, session });
    if (state === 'completed') {
      await store.stage(back.attemptId, { ok: true, text: '' });
      await store.publish('row-completed-back', { attemptId: back.attemptId, session });
    } else if (state === 'failed')
      await store.failAttempt(back.attemptId);
  }
  ids.neutral = (await store.createPage('row-neutral', { deckId: deck.id, mainKey: 'neutral entry' })).pageId;
  await signIn(a.page);
  assert.equal(await a.page.locator('.capture .badge').count(), 0);
  assert.deepEqual((await a.page.locator('.capture .state-icon').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))).sort(), ['Completed', 'Failed', 'Pending: generating']);
  await a.worker.evaluate(async (deck) => {
    const now = new Date().toISOString();
    await chrome.storage.local.set({
      'capture-visual-saving': { operationId: 'visual-saving', state: 'saving', createdAt: now, payload: { mainKey: 'Saving example', snapshot: deck } },
      'capture-visual-failed': { operationId: 'visual-failed', state: 'pending', error: 'Controlled save failure', createdAt: now, payload: { mainKey: 'Unsaved example', snapshot: deck } }
    });
  }, deck);
  const unsaved = a.page.locator('.capture').filter({ hasText: 'Unsaved example' });
  await unsaved.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  assert.equal(await unsaved.getAttribute('data-state'), 'failed');
  assert.equal(await unsaved.getByRole('img').getAttribute('aria-label'), 'Not saved to your account');
  const saving = a.page.locator('.capture').filter({ hasText: 'Saving example' });
  assert.equal(await saving.getAttribute('data-state'), 'loading');
  for (const theme of ['light', 'dark']) {
    await a.page.getByLabel('Appearance', { exact: true }).selectOption(theme);
    assert.equal(await saving.getByRole('img').getAttribute('aria-label'), 'Pending');
    assert.equal(await saving.getByRole('img').getAttribute('title'), 'Pending');
    assert.equal(await saving.locator('p').count(), 1, 'only captured text remains, without helper or empty paragraph');
    assert.equal(await unsaved.getByText('Not saved to your account.', { exact: true }).count(), 1);
    await a.page.screenshot({ path: `artifacts/v0.2.0-dashboard-${theme}.png`, fullPage: true });
  }
  await a.worker.evaluate(() => chrome.storage.local.remove(['capture-visual-saving', 'capture-visual-failed']));
  await a.page.getByRole('heading', { name: 'My Deck', exact: true }).click();
  const row = state => a.page.locator(`tr[data-page-id="${ids[state]}"]`);
  for (const state of Object.keys(ids)) {
    assert.equal(await row(state).getAttribute('data-state'), state);
    assert.equal(await row(state).locator('button').count(), 1);
    assert.equal(await row(state).locator('.badge').count(), 0);
  }
  assert.equal(await row('neutral').getByRole('img').count(), 0);
  assert.equal(await row('loading').getByRole('img').getAttribute('aria-label'), 'Pending: generating');
  for (const theme of ['light', 'dark']) {
    await a.page.getByLabel('Appearance', { exact: true }).selectOption(theme);
    await row('completed').getByRole('button').focus();
    await a.page.screenshot({ path: `artifacts/v0.2.0-rows-${theme}.png`, fullPage: true });
    const cdp = await a.context.newCDPSession(a.page);
    for (const type of ['deuteranopia', 'protanopia', 'tritanopia', 'achromatopsia']) {
      await cdp.send('Emulation.setEmulatedVisionDeficiency', { type });
      await a.page.screenshot({ path: `artifacts/v0.2.0-rows-${theme}-${type}.png`, fullPage: true });
    }
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' }); await cdp.detach();
    const report = await a.page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = color => {
        const rgb = color.trim().replace('#', '').match(/../g).map(value => parseInt(value, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const ratio = (a, b) => { const [hi, lo] = [a, b].map(name => luminance(style.getPropertyValue(`--${name}`))).sort((a, b) => b - a); return (hi + .05) / (lo + .05); };
      const backgrounds = ['background', 'surface', 'hover', 'completed-bg', 'pending-bg', 'failed-bg'];
      return [
        ...backgrounds.flatMap(bg => ['text', 'muted'].map(fg => ({ pair: `${fg}/${bg}`, ratio: ratio(fg, bg), minimum: 4.5 }))),
        ...backgrounds.map(bg => ({ pair: `focus/${bg}`, ratio: ratio('focus', bg), minimum: 3 })),
        ...['completed', 'pending', 'failed'].map(state => ({ pair: `${state} cue`, ratio: ratio(`${state}-cue`, `${state}-bg`), minimum: 3 })),
        ...backgrounds.map(bg => ({ pair: `border/${bg}`, ratio: ratio('border', bg), minimum: 3 })),
        ...['primary', 'primary-hover'].map(bg => ({ pair: `on-primary/${bg}`, ratio: ratio('on-primary', bg), minimum: 4.5 }))
      ];
    });
    for (const item of report) assert.ok(item.ratio >= item.minimum, `${theme} ${item.pair}: ${item.ratio.toFixed(2)}`);
    t.diagnostic(`${theme} minimum text ${Math.min(...report.filter(item => item.minimum === 4.5).map(item => item.ratio)).toFixed(2)}:1; minimum cue/focus/border ${Math.min(...report.filter(item => item.minimum === 3).map(item => item.ratio)).toFixed(2)}:1`);
  }
  for (const order of ['newest', 'oldest', 'az', 'za']) {
    await a.page.getByLabel('Sort pages', { exact: true }).selectOption(order);
    const { sortPages } = await import('../extension/sorting.ts');
    const expected = sortPages((await store.pages()).map(page => ({ id: page.id, createdAt: page.createdAt, mainKey: keyOf(page) })), order).map(page => page.id);
    await waitFor(async () => JSON.stringify(await a.page.locator('tr[data-page-id]').evaluateAll(rows => rows.map(row => row.dataset.pageId))) === JSON.stringify(expected), `${order} page order loaded`);
    assert.deepEqual(await a.page.locator('table tr td:first-child').allTextContents(), ['001', '002', '003', '004']);
  }
  for (const target of ['index', 'entry', 'cue', 'space', 'keyboard']) {
    const completed = row('completed');
    if (target === 'index') await completed.locator('td').first().click();
    else if (target === 'entry') await completed.getByRole('button').click();
    else if (target === 'cue') await completed.getByRole('img').click();
    else if (target === 'space') {
      // Raw mouse clicks do not scroll; bring the row on screen first.
      await completed.scrollIntoViewIfNeeded();
      const box = await completed.boundingBox(); await a.page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
    } else { await completed.getByRole('button').focus(); await a.page.keyboard.press('Enter'); }
    await a.page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();
    assert.ok(a.page.url().endsWith(`#page/${ids.completed}`));
    assert.ok(await a.page.locator('.status-completed').count() > 0, 'page detail keeps status information');
    await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  }
  await row('completed').getByRole('button').evaluate(node => {
    const selection = getSelection(), range = document.createRange(); range.selectNodeContents(node); selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  });
  assert.ok(a.page.url().endsWith(`#deck/${deck.id}`), 'selecting entry text does not navigate');
  const completedKey = (await store.page(ids.completed)).components.find(item => item.moduleType === 'main-key');
  await store.savePage('row-long-text', { pageId: ids.completed, changes: [{ componentId: completedKey.id, content: textBlocks('LongWord'.repeat(40) + ' 幸福 — Grüße') }] });
  await a.page.reload();
  await row('completed').waitFor();
  await a.page.setViewportSize({ width: 390, height: 760 });
  await a.page.screenshot({ path: 'artifacts/v0.2.0-rows-narrow.png', fullPage: true });
  assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await a.page.emulateMedia({ forcedColors: 'active' });
  await row('failed').getByRole('button').focus();
  await a.page.screenshot({ path: 'artifacts/v0.2.0-rows-forced-colors.png', fullPage: true });
  assert.equal(await row('failed').getByRole('img').getAttribute('aria-label'), 'Failed');
  await row('neutral').getByRole('button', { name: 'neutral entry', exact: true }).press('Space');
  await a.page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();
  assert.ok(a.page.url().endsWith(`#page/${ids.neutral}`));
});

test('manual page UI: drafts, leave choices, sorting, failed-save recovery, and deletion', { timeout: 45000 }, async (t) => {
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
  await a.page.getByRole('button', { name: 'zebra', exact: true }).click();
  await a.page.getByRole('button', { name: 'Generate missing', exact: true }).waitFor();
  const created = (await application.store.pages())[0];
  const shape = async () => (await application.store.page(created.id)).components.map(item => [item.moduleType, text(item)]);
  assert.equal(created.status, null, 'manual creation never generates');
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['context', 'zoo animal'], ['german-examples', '']]);
  assert.equal(await a.page.getByRole('button', { name: 'Retry', exact: true }).count(), 0);
  assert.equal(await a.page.getByRole('button', { name: 'Retry page', exact: true }).count(), 0);
  await componentArticle(a.page, '<German explanation + examples>').getByText('Not generated yet.').waitFor();

  // Shaping from the module window and the component controls, each saved at once.
  await a.page.getByRole('button', { name: 'Add Text', exact: true }).click();
  await componentArticle(a.page, 'Text').waitFor();
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['context', 'zoo animal'], ['german-examples', ''], ['text', '']]);
  await a.page.getByRole('button', { name: 'Move Text up', exact: true }).click();
  await waitFor(async () => (await shape())[2][0] === 'text', 'Text moved up');
  await a.page.getByRole('button', { name: 'Delete Context', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await shape()).length, 4);
  await a.page.getByRole('button', { name: 'Delete Context', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await waitFor(async () => (await shape()).length === 3, 'Context deleted');
  assert.deepEqual(await shape(), [['main-key', 'zebra'], ['text', ''], ['german-examples', '']]);
  assert.equal(await a.page.getByRole('button', { name: 'Move Main key up', exact: true }).count(), 0, 'the main key has no move or delete controls');
  assert.equal(await a.page.getByRole('button', { name: 'Delete Main key', exact: true }).count(), 0);

  await a.page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await a.page.getByText('Finish editing with Save or Cancel').waitFor();
  assert.equal(await a.page.getByRole('button', { name: 'Add Text', exact: true }).isDisabled(), true, 'shaping waits until editing ends');
  await a.page.getByLabel('Edit Main key', { exact: true }).fill('discard this');
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Discard', exact: true }).click();
  assert.equal(keyOf(await application.store.page(created.id)), 'zebra');
  await a.page.getByRole('button', { name: 'zebra', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await a.page.getByLabel('Edit Main key', { exact: true }).fill('cancel this');
  await a.page.getByLabel('Edit Text', { exact: true }).fill('cancel both');
  await a.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(keyOf(await application.store.page(created.id)), 'zebra');
  await a.page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await a.page.getByLabel('Edit Text', { exact: true }).fill('saved own text');
  await a.page.getByLabel('Edit Main key', { exact: true }).fill('alpha');
  await application.close();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  assert.equal(await a.page.getByLabel('Edit Main key', { exact: true }).inputValue(), 'alpha');
  application = (await createTestApplication(t, { databaseKey })); await application.start();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();
  const saved = await application.store.page(created.id);
  assert.deepEqual(saved.components.map(item => [item.moduleType, text(item)]), [['main-key', 'alpha'], ['text', 'saved own text'], ['german-examples', '']]);
  assert.equal(saved.createdAt, created.createdAt);
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByRole('button', { name: 'Add page manually', exact: true }).click();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('alert').filter({ hasText: 'Enter a main key.' }).waitFor();
  await a.page.getByLabel('Main key', { exact: true }).fill('aardvark');
  await a.page.getByRole('button', { name: /^(Save|Try saving again)$/ }).click();
  await a.page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();
  await a.page.getByRole('button', { name: '← My Deck', exact: true }).click();
  await a.page.getByLabel('Sort pages', { exact: true }).selectOption('az');
  await waitFor(async () => JSON.stringify(await a.page.locator('table .entry').allTextContents()) === JSON.stringify(['aardvark', 'alpha']), 'ascending page list loaded');
  assert.deepEqual(await a.page.locator('table tr td:first-child').allTextContents(), ['001', '002']);
  await a.page.getByLabel('Sort pages', { exact: true }).selectOption('za');
  await waitFor(async () => JSON.stringify(await a.page.locator('table .entry').allTextContents()) === JSON.stringify(['alpha', 'aardvark']), 'descending page list loaded');
  await a.page.getByRole('button', { name: 'alpha', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await a.page.getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal((await application.store.pages()).length, 2);
  await a.page.getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Delete page', exact: true }).click();
  await a.page.getByRole('button', { name: 'aardvark', exact: true }).waitFor();
  assert.equal((await application.store.pages()).length, 1);
});

test('retry UI: exact confirmation, generate missing, and a two-installation lock preserve drafts until explicit resubmission', { timeout: 35000 }, async (t) => {
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
  await b.page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await b.page.getByLabel('Edit <Sentence usage>', { exact: true }).fill('draft front');
  await b.page.getByLabel('Edit <German explanation + examples>', { exact: true }).fill('draft back');
  const explanation = componentArticle(a.page, '<German explanation + examples>');
  await explanation.getByRole('button', { name: 'Retry', exact: true }).click();
  assert.equal(await a.page.getByRole('dialog').locator('p').textContent(), 'Retry will replace this component’s content, including your edits to it. The main key, Context, and other components will not change.');
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(text(modulesOf(await application.store.page(pageId))[1]), 'saved original');
  await explanation.getByRole('button', { name: 'Retry', exact: true }).click();
  await a.page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await waitFor(() => release, 'retry provider started');
  await waitFor(() => explanation.getByRole('button', { name: 'Retry', exact: true }).isDisabled(), 'retry disables its control while generating');
  // Every Retry is briefly disabled while the request is in flight; once accepted, only the generating component stays locked.
  await waitFor(() => componentArticle(a.page, '<Sentence usage>').getByRole('button', { name: 'Retry', exact: true }).isEnabled(), 'other components stay available');
  assert.equal(await explanation.getByRole('button', { name: 'Retry', exact: true }).isDisabled(), true);
  await b.page.getByRole('button', { name: 'Save', exact: true }).click();
  await b.page.getByRole('alert').filter({ hasText: 'still generating' }).waitFor();
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', '']);
  assert.equal(await b.page.getByLabel('Edit <German explanation + examples>', { exact: true }).inputValue(), 'draft back');
  release('regenerated component');
  await waitFor(async () => modulesOf(await application.store.page(pageId))[1].status === 'completed', 'retry saved');
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['saved original', 'regenerated component']);
  await b.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await b.page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();
  assert.deepEqual(modulesOf(await application.store.page(pageId)).map(text), ['draft front', 'draft back']);

  // Whole-page retry names its scope; a module added to the page is filled by Generate missing without confirmation.
  await a.page.getByRole('button', { name: 'Retry page', exact: true }).click();
  assert.match(await a.page.getByRole('dialog').locator('p').textContent(), /^Retry will replace the content of every generated component on this page/);
  await a.page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await useModules(application.store, ['sentence-usage', 'german-examples', 'german-explanation']);
  await a.page.reload();
  assert.equal(await a.page.getByRole('button', { name: 'Generate missing', exact: true }).count(), 0, 'a deck change never reaches the page');
  await a.page.getByRole('button', { name: 'Add <German explanation>', exact: true }).click();
  await a.page.getByRole('button', { name: 'Generate missing', exact: true }).click();
  await waitFor(async () => modulesOf(await application.store.page(pageId)).length === 3, 'missing component generated');
  assert.equal(await a.page.getByRole('dialog').count(), 0);
});

// Pointer drags go through dnd-kit's activation distance, so move in steps.
async function drag(page, source, target, { below = false } = {}) {
  // A mouse cannot leave the viewport; the module window is sticky, so it stays in view.
  // The page may re-render once as its account refresh lands; scroll again if it did.
  await target.scrollIntoViewIfNeeded().catch(() => target.scrollIntoViewIfNeeded());
  const from = await source.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 4 });
  // Read the target once the drag is active, then aim at it in two passes in case the page scrolled.
  for (let pass = 0; pass < 2; pass++) {
    const to = await target.boundingBox();
    await page.mouse.move(to.x + to.width / 2, to.y + (below ? to.height * 0.8 : to.height / 2), { steps: 8 });
  }
  await page.mouse.up();
  // dnd-kit swallows clicks for 50 ms after a drop so the release is not also a click.
  await new Promise(resolve => setTimeout(resolve, 100));
}

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

  // Drag Text from the window onto the Context card: it lands in that position.
  await drag(a.page, a.page.locator('.window-module[data-type="text"] .window-module-body'), card('Context'));
  await waitFor(async () => (await types()).includes('text'), 'Text dragged onto the page');
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german-examples']);
  assert.deepEqual((await store.deck((await store.page(pageId)).deckId)).modules.map(module => module.type),
    ['main-key', 'context', 'german-examples'], 'the deck is unchanged');

  // Reorder by dragging a handle below the last card.
  await card('Text').waitFor();
  await drag(a.page, a.page.getByRole('button', { name: 'Drag Text', exact: true }), a.page.locator('.drop-end'));
  await waitFor(async () => (await types()).at(-1) === 'text', 'Text dragged to the end');
  assert.deepEqual(await types(), ['main-key', 'context', 'german-examples', 'text']);

  // Keyboard reorder: Space picks the handle up, the arrows move it, Space drops it.
  await a.page.getByRole('button', { name: 'Drag Text', exact: true }).focus();
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
  await announced('Text was dropped at position 2.');

  // Deck settings take a dragged module too, and the main key stays first.
  const deckId = (await store.page(pageId)).deckId;
  await a.page.goto(`chrome-extension://${a.id}/app.html#configure/${deckId}`);
  await drag(a.page, a.page.locator('.window-module[data-type="sentence-usage"] .window-module-body'), a.page.locator('.drop-end'));
  await a.page.locator('.module-block').filter({ hasText: '<Sentence usage>' }).waitFor();
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('heading', { name: 'Your decks.' }).waitFor();
  assert.deepEqual((await store.deck(deckId)).modules.map(module => module.type), ['main-key', 'context', 'german-examples', 'sentence-usage']);
  assert.deepEqual(await types(), ['main-key', 'text', 'context', 'german-examples'], 'the page keeps its own modules');
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
  await a.page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await a.page.getByLabel('Edit <Sentence usage>', { exact: true }).fill('save with lost acknowledgment');
  await loseNextAcknowledgment(a.worker, '/api/page/save');
  await a.page.getByRole('button', { name: 'Save', exact: true }).click();
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).waitFor();
  const front = modulesOf(captured)[0];
  await waitFor(async () => text(modulesOf(await application.store.page(captured.id))[0]) === 'save with lost acknowledgment', 'original component save committed');
  await application.store.savePage('later-remote-edit', { pageId: captured.id, changes: [{ componentId: front.id, content: textBlocks('later remote edit') }] });
  await a.page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await a.page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();
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
  await a.page.getByRole('button', { name: 'Edit page', exact: true }).waitFor();
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
  await a.page.getByRole('heading', { name: 'Your decks.' }).waitFor();
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
  await other.getByRole('heading', { name: 'Your decks.' }).waitFor();
  const reading = await a.context.newPage(); await reading.goto(apiOrigin + '/health');
  for (const theme of ['light', 'dark']) {
    await a.page.getByLabel('Appearance', { exact: true }).selectOption(theme);
    assert.equal(await a.page.getByRole('heading', { name: 'Recent captures', exact: true }).evaluate(node => node.nextElementSibling === null), true, 'empty section has no replacement paragraph or gap');
    await a.page.screenshot({ path: `artifacts/v0.2.1-empty-dashboard-${theme}.png`, fullPage: true });
  }
  const tabId = await a.page.evaluate(async () => (await chrome.tabs.getCurrent()).id);
  const capture = text => a.worker.evaluate(async ({ tabId, text }) => globalThis.captureForTest(
    { menuItemId: 'capture', selectionText: text }, await chrome.tabs.get(tabId)), { tabId, text });
  const feedback = page => page.locator('vocabularium-feedback .feedback-item');
  const appearance = page => feedback(page).evaluate(node => {
    const properties = ['fontFamily', 'fontSize', 'lineHeight', 'color', 'backgroundColor', 'padding', 'margin', 'border', 'borderRadius', 'boxShadow', 'maxWidth'];
    const inspect = element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return { css: Object.fromEntries(properties.map(key => [key, style[key]])), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return { text: node.textContent, item: inspect(node), close: inspect(node.querySelector('button')), label: node.querySelector('button').getAttribute('aria-label') };
  });
  for (const theme of ['light', 'dark']) {
    await a.page.getByLabel('Appearance', { exact: true }).selectOption(theme);
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
  await a.page.getByLabel('Appearance', { exact: true }).selectOption('light');
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
    await a.page.getByLabel('Appearance', { exact: true }).selectOption(theme);
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
  await a.page.getByRole('heading', { name: 'Your decks.' }).waitFor();
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
