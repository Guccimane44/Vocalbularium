// Assembled reliability: lost acknowledgments, worker suspension and cancellation.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { text, textBlocks, useModules, wordResult, staged, fieldEdit } from '../helpers/pages.mjs';
import { modulesOf, apiOrigin, launch, signIn, waitFor, captureFrom, pageReady } from './helpers.mjs';

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
