import test, { createTestApplication } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp, appendFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { Diagnostics } from '../src/server/diagnostics.mjs';
import { OpenCodeProvider } from '../src/server/opencode.mjs';

const origin = process.env.VOCABULARIUM_API_URL ?? 'http://127.0.0.1:4318';
async function waitFor(predicate, message) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${message}`);
}

test('logging journey: capture correlation, offline worker restart, budgets and settings cleanup preserve product data', { timeout: 120000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-logging-browser-'));
  const databaseKey = join(directory, 'account-fixture'), logDirectory = join(directory, 'diagnostics');
  const extension = join(directory, 'extension');
  await cp(resolve(process.env.VOCABULARIUM_TEST_EXTENSION ?? 'artifacts/extension'), extension, { recursive: true });
  const config = await readFile(join(extension, 'config.js'), 'utf8');
  assert.equal(JSON.parse(config.match(/^export const API_URL = (.+);/m)[1]), origin, 'Refuse a package pointed at a different API from the disposable fixture');
  await appendFile(join(extension, 'background.js'), '\nglobalThis.captureForTest = handleCapture;\n');
  const provider = new OpenCodeProvider({ apiKey: 'synthetic-browser-key', fetchImpl: async (_url, request) => {
    const body = JSON.parse(request.body), interpretation = body.messages[0].content.includes('vocabulary_interpretation');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant',
      content: JSON.stringify(interpretation ? { inputType: 'word_phrase', sourceLanguage: 'Chinese' } : { text: 'synthetic generation output' }) } }] });
  } });
  let application = await createTestApplication(t, { databaseKey, provider,
    diagnostics: new Diagnostics({ directory: logDirectory }) });
  await application.start({ port: Number(new URL(origin).port) });
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  let worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  let page = await context.newPage(); await page.goto(`chrome-extension://${id}/app.html`);
  t.after(async () => { await context.close(); await application.close(); await rm(directory, { recursive: true, force: true }); });
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your decks.' }).waitFor();
  const reading = await context.newPage(); await reading.goto(origin + '/health');
  const operationId = await worker.evaluate(async ({ origin }) => {
    const [tab] = await chrome.tabs.query({ url: origin + '/health' });
    return globalThis.captureForTest({ menuItemId: 'capture', selectionText: '幸福' }, tab);
  }, { origin });
  await waitFor(async () => (await application.store.kartes())[0]?.status === 'completed', 'capture completes and publishes');
  await waitFor(async () => {
    const events = (await application.diagnostics.inspect({ operationId })).events;
    return events.some(event => event.event === 'capture.invoked') &&
      events.some(event => event.source === 'extension' && event.event === 'request.completed' && event.requestId);
  }, 'capture and acknowledged request collected automatically');
  const events = (await application.diagnostics.inspect({ operationId })).events;
  assert.ok(events.some(event => event.source === 'extension' && event.event === 'request.completed' && event.requestId));
  assert.ok(events.some(event => event.source === 'backend' && event.event === 'provider.request' && event.content.prompts));
  const captured = (await application.store.kartes())[0];

  await application.close();
  const deck = await worker.evaluate(async () => (await chrome.storage.local.get('account')).account.defaultDeckSnapshot);
  const failed = await page.evaluate(async deck => chrome.runtime.sendMessage({ type: 'create-karte', operationId: 'offline-logging-save',
    payload: { deckId: deck.id, seites: deck.seites.map(seite => ({ seiteId: seite.id, text: '' })) } }), deck);
  assert.ok(failed.error);
  const buffered = await worker.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('vocabularium-diagnostics-v1'); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
    const result = await new Promise((resolve, reject) => { const r = db.transaction('events').objectStore('events').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
    db.close(); return result;
  });
  const offlineEvent = buffered.find(event => event.operationId === 'offline-logging-save' && event.event === 'request.failed');
  assert.ok(offlineEvent);
  await worker.evaluate(async () => { await chrome.alarms.clear('recover'); await chrome.alarms.clear('diagnostics'); globalThis.oldLoggingWorker = true; });
  await page.close();
  const internals = await context.newPage(); await internals.goto('chrome://serviceworker-internals');
  const registration = internals.locator('.serviceworker-registration').filter({ hasText: worker.url() });
  await registration.getByRole('button', { name: 'Stop', exact: true }).click();
  await waitFor(async () => (await registration.locator('.serviceworker-running-status .value').textContent()) === 'STOPPED', 'actual worker termination');
  application = await createTestApplication(t, { databaseKey, provider, diagnostics: new Diagnostics({ directory: logDirectory }) });
  await application.start({ port: Number(new URL(origin).port) });
  page = await context.newPage(); await page.goto(`chrome-extension://${id}/app.html`);
  await page.getByRole('heading', { name: 'Your decks.' }).waitFor();
  worker = context.serviceWorkers().find(item => item.url().includes(id));
  assert.equal(await worker.evaluate(() => globalThis.oldLoggingWorker), undefined);
  await waitFor(async () => (await application.diagnostics.inspect({ operationId: 'offline-logging-save' })).events.some(event => event.eventId === offlineEvent.eventId), 'original offline evidence after restart');
  const originals = (await application.diagnostics.inspect({ operationId: 'offline-logging-save' })).events;
  assert.equal(originals.filter(event => event.eventId === offlineEvent.eventId).length, 1);
  assert.equal(originals.find(event => event.eventId === offlineEvent.eventId).occurredAt, offlineEvent.occurredAt);
  assert.equal((await application.store.kartes()).length, 1, 'logging recovery never replays the failed product save');
  assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get('save-offline-logging-save'))['save-offline-logging-save'])).state, 'pending');

  await page.getByRole('button', { name: 'Diagnostic logs', exact: true }).click();
  await page.getByRole('heading', { name: 'Diagnostic logs', exact: true }).waitFor();
  await page.getByLabel('Extension buffer budget (MiB)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Apply buffer budget', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Logging is degraded' }).waitFor();
  const manual = await page.evaluate(async deck => chrome.runtime.sendMessage({ type: 'create-karte', operationId: 'full-log-buffer-manual',
    payload: { deckId: deck.id, seites: deck.seites.map(seite => ({ seiteId: seite.id, text: 'manual content stays out of logs' })) } }), deck);
  assert.equal(manual.error, undefined);
  assert.equal((await application.store.kartes()).length, 2);
  await page.getByRole('button', { name: 'Refresh log status', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Logging is degraded' }).waitFor();
  await page.getByRole('button', { name: 'Preview cleanup', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'would be removed' }).waitFor();
  await page.getByRole('button', { name: 'Clear selected logs', exact: true }).click();
  await page.getByRole('button', { name: 'Clear logs', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Cleared' }).waitFor();
  assert.equal((await application.store.karte(captured.id)).selected_text, '幸福');
  assert.equal((await application.store.kartes()).length, 2);
  assert.ok(await worker.evaluate(async () => (await chrome.storage.local.get('save-offline-logging-save'))['save-offline-logging-save']));
  await application.diagnostics.ingest([offlineEvent]);
  assert.equal((await application.diagnostics.inspect({ operationId: 'offline-logging-save' })).events.some(event => event.eventId === offlineEvent.eventId), false);
});
