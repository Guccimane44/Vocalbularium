// Capture and save feedback in the dashboard and the lists.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resultFor, text, useModules } from '../helpers/pages.mjs';
import { apiOrigin, launch, chooseAppearance, signIn, waitFor, captureFrom } from './helpers.mjs';

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
