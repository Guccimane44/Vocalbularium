// Upgrade from an earlier build.
import test, { createTestApplication } from '../helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, signIn } from './helpers.mjs';

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
