// Capture: receipts, Context, motion, and recent captures.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { notePlain } from '@vocabularium/domain/pages';
import { resultFor, sentenceResult, text, useModules, wordResult, staged } from '../helpers/pages.mjs';
import { keyOf, modulesOf, componentArticle, removeFromDeck, apiOrigin, launch, signIn, waitFor, steps, captureFrom } from './helpers.mjs';

const byKey = async (store, key) => (await store.pages()).find(page => keyOf(page) === key);

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
