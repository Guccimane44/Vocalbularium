import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { createPrototype } from '../prototypes/server.mjs';

const extension = resolve('prototypes/extension');
async function waitFor(predicate, message, timeout = 18000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${message}`);
}
async function launch(profile) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${id}/dashboard.html`);
  await worker.evaluate(() => globalThis.foundation.initialize());
  return { context, worker, id, dashboard };
}
async function invoke(worker, selectionText) {
  return worker.evaluate(async selectionText => {
    const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1:4317/fixture' });
    return globalThis.foundation.handleCapture({ selectionText, menuItemId: 'capture' }, tabs[0]);
  }, selectionText);
}

test('real Chromium extension: feedback, independent captures, worker restart, and browser-session recovery', { timeout: 90000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-browser-'));
  const prototype = createPrototype({ filename: join(directory, 'test.sqlite'), delayMs: 5500 });
  const contexts = new Set();
  t.after(async () => {
    for (const context of contexts) await context.close().catch(() => {});
    await prototype.close();
    await rm(directory, { recursive: true, force: true });
  });
  await prototype.start();
  const profileA = join(directory, 'profile-a');
  let a = await launch(profileA);
  contexts.add(a.context);
  const reading = await a.context.newPage();
  await reading.goto('http://127.0.0.1:4317/fixture');
  const chosen = await reading.locator('#selection').evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return selection.toString();
  });
  const firstId = await invoke(a.worker, chosen);
  assert.ok(firstId);
  const feedback = reading.getByRole('status');
  assert.equal(await feedback.count(), 1);
  assert.equal(await feedback.textContent(), 'Capture received×');
  assert.equal(prototype.store.cards()[0].selected_text, chosen);
  assert.equal(prototype.store.cards()[0].status, 'loading');
  const firstCardId = prototype.store.cards()[0].id;
  const before = Date.now();
  await feedback.waitFor({ state: 'detached', timeout: 4000 });
  const elapsed = Date.now() - before;
  assert.ok(elapsed >= 2500 && elapsed < 3800, `Feedback duration was ${elapsed} ms after handler return`);
  assert.equal(prototype.store.card(firstCardId).status, 'loading');
  await a.dashboard.close();
  await waitFor(() => prototype.store.card(firstCardId).status === 'completed', 'generation survives dashboard closure');

  const frameSelection = await reading.frameLocator('iframe').locator('#frame-selection').evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return selection.toString();
  });
  await invoke(a.worker, frameSelection);
  await invoke(a.worker, frameSelection);
  assert.equal(await reading.getByRole('status').count(), 2);
  await reading.getByRole('button', { name: 'Close capture feedback' }).first().click();
  assert.equal(await reading.getByRole('status').count(), 1);
  await waitFor(() => prototype.store.cards().every(card => card.status === 'completed'), 'duplicate captures complete');
  assert.equal(prototype.store.cards().length, 3);
  assert.equal(prototype.store.cards().filter(card => card.selected_text === frameSelection).length, 2);
  assert.equal(reading.url(), 'http://127.0.0.1:4317/fixture');

  // Stopping the worker is deliberately different from closing its browser profile.
  const priorSession = await a.worker.evaluate(async () => (await chrome.storage.session.get('session')).session);
  const devtools = await a.context.newCDPSession(reading);
  const { targetInfos } = await devtools.send('Target.getTargets');
  const workerTarget = targetInfos.find(target => target.type === 'service_worker' && target.url === a.worker.url());
  assert.ok(workerTarget, 'extension worker target is available');
  const newWorker = a.context.waitForEvent('serviceworker');
  await devtools.send('Target.closeTarget', { targetId: workerTarget.targetId });
  const dashboard = await a.context.newPage();
  await dashboard.goto(`chrome-extension://${a.id}/dashboard.html`);
  a.worker = await newWorker;
  const sameSession = await a.worker.evaluate(() => globalThis.foundation.initialize());
  assert.deepEqual(sameSession, priorSession);
  await devtools.detach();

  const b = await launch(join(directory, 'profile-b'));
  contexts.add(b.context);
  const otherReading = await b.context.newPage();
  await otherReading.goto('http://127.0.0.1:4317/fixture');
  await invoke(a.worker, 'interrupted on A');
  const interruptedCard = prototype.store.cards().find(card => card.selected_text === 'interrupted on A');
  await invoke(b.worker, 'continues on B');
  const otherCard = prototype.store.cards().find(card => card.selected_text === 'continues on B');
  const pendingSession = await a.worker.evaluate(async () => (await chrome.storage.session.get('session')).session);
  await a.context.close(); contexts.delete(a.context);
  await waitFor(() => prototype.store.card(otherCard.id).status === 'completed', 'other installation completes');
  assert.equal(prototype.store.card(interruptedCard.id).pages[0].text, '', 'server must not publish without originating browser');
  a = await launch(profileA); contexts.add(a.context);
  const nextSession = await a.worker.evaluate(() => globalThis.foundation.initialize());
  assert.equal(nextSession.installationId, pendingSession.installationId);
  assert.equal(nextSession.epoch, pendingSession.epoch + 1);
  assert.notEqual(nextSession.sessionId, pendingSession.sessionId);
  assert.equal(prototype.store.card(interruptedCard.id).status, 'failed');
  assert.equal(prototype.store.card(otherCard.id).status, 'completed');
  assert.equal(prototype.store.card(firstCardId).status, 'completed');
  assert.throws(() => prototype.store.stage(interruptedCard.pages[0].attempt_id, { ok: true, text: 'late' }), error => error.code === 'stale_attempt');
  console.log(`Browser evidence: ${a.context.browser()?.version() ?? 'Chromium'}, persistent profiles, independent installations, actual worker stop/restart and browser close/reopen.`);
});
