// Report a problem (D336): what a report keeps, its receipt, Undo, filing, and its route.
import test, { createTestApplication, createTestDatabase, createTestStore } from './helpers/database.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { capture, useModules } from './helpers/pages.mjs';
import { session } from './helpers/generation.mjs';

const build = { version: '0.16.7', commit: 'a'.repeat(40), dirty: false };
const extensionBuild = { version: '0.16.7', commit: 'b'.repeat(40), dirty: true };

async function pageWithGerman(store) {
  await store.openSession('open', session);
  await useModules(store, ['german']);
  const { pageId } = await capture(store, 'capture', session, 'Ufer');
  const german = (await store.page(pageId)).components.find(component => component.moduleType === 'german');
  return { pageId, componentId: german.id };
}

test('a report on a card keeps the page as it was, both builds and the logs, and outlives the page', async t => {
  const store = await createTestStore(t);
  const { pageId, componentId } = await pageWithGerman(store);
  const logs = [{ event: 'api.completed', occurredAt: '2026-11-19T10:00:00.000Z' }];
  const report = { text: 'The examples are in English.', screen: 'page', pageId, componentId, extensionBuild, includeLogs: true };
  const { reportId, replayed } = await store.createReport('report-1', report, { build, logs, now: new Date('2026-11-19T10:05:00.000Z') });
  assert.equal(replayed, false);
  const row = await store.report(reportId);
  assert.equal(row.text, 'The examples are in English.');
  assert.equal(row.module_type, 'german');
  assert.equal(row.created_at, '2026-11-19T10:05:00.000Z');
  assert.deepEqual(JSON.parse(row.builds), { api: build, extension: extensionBuild });
  assert.equal(JSON.parse(row.page).id, pageId);
  assert.deepEqual(JSON.parse(row.logs), logs);
  assert.equal(row.issue, null);

  // The same operation replays; another report under its ID is refused.
  assert.equal((await store.createReport('report-1', report, { build, logs: [] })).reportId, reportId, 'a resent report is the same report, whatever the logs');
  await assert.rejects(store.createReport('report-1', { ...report, text: 'Something else.' }, { build }), { code: 'operation_reused' });

  await store.deletePage('delete', pageId);
  assert.equal(JSON.parse((await store.report(reportId)).page).id, pageId, 'the report keeps the deleted page as it was');
});

test('a report off a page, or without logs, keeps neither; a card needs its page', async t => {
  const store = await createTestStore(t);
  const { pageId } = await pageWithGerman(store);
  const { reportId } = await store.createReport('home', { text: 'Home is empty.', screen: 'home', includeLogs: false }, { build, logs: [{ event: 'x' }] });
  const row = await store.report(reportId);
  assert.deepEqual([row.page_id, row.component_id, row.module_type, row.page, row.logs], [null, null, null, null, null]);
  await assert.rejects(store.createReport('orphan', { text: 'x', screen: 'page', componentId: 'c', includeLogs: false }, { build }), { code: 'invalid' });
  await assert.rejects(store.createReport('gone', { text: 'x', screen: 'page', pageId, componentId: 'no-such-card', includeLogs: false }, { build }), { code: 'deleted' });
  await assert.rejects(store.createReport('empty', { text: '  ', screen: 'home', includeLogs: false }, { build }), { code: 'invalid' });
  await assert.rejects(store.createReport('long', { text: 'x'.repeat(2001), screen: 'home', includeLogs: false }, { build }), { code: 'invalid' });
});

// The daily agent's script, run as the agent runs it, against this database.
const reports = async (databaseUrl, ...args) => {
  try { const { stdout } = await promisify(execFile)(process.execPath, ['scripts/reports.mjs', ...args], { env: { ...process.env, DATABASE_URL: databaseUrl } }); return { ok: true, out: stdout }; }
  catch (error) { return { ok: false, out: error.stderr }; }
};

test('Undo deletes a report until it is filed; the script files it once, with no page content in the issue', async t => {
  const { databaseUrl } = await createTestDatabase(t, 'reports');
  const store = await createTestStore(t, 'reports');
  const { pageId, componentId } = await pageWithGerman(store);
  const first = await store.createReport('one', { text: 'First.', screen: 'home', includeLogs: false }, { build, now: new Date('2026-11-19T10:00:00.000Z') });
  const second = await store.createReport('two', { text: 'The examples are in English.\nNot German.', screen: 'page', pageId, componentId, extensionBuild, includeLogs: true },
    { build, logs: [{ event: 'provider.completed', content: 'Ufer secret prompt' }], now: new Date('2026-11-19T11:00:00.000Z') });
  assert.deepEqual((await store.unfiledReports()).map(row => row.id), [first.reportId, second.reportId], 'oldest first');

  await store.deleteReport('undo-one', first.reportId);
  await assert.rejects(store.report(first.reportId), { code: 'deleted' });
  assert.equal((await store.deleteReport('undo-one', first.reportId)).replayed, true, 'a resent Undo replays');

  const pending = JSON.parse((await reports(databaseUrl, 'pending')).out);
  assert.deepEqual(pending.map(report => [report.id, report.moduleType, report.hasPage, report.hasLogs]), [[second.reportId, 'german', true, true]]);
  assert.equal(JSON.stringify(pending).includes('Ufer'), false, 'pending names no page content');
  const { title, body } = JSON.parse((await reports(databaseUrl, 'issue', second.reportId)).out);
  assert.equal(title, 'Report: The examples are in English.');
  assert.match(body, /> The examples are in English\.\n> Not German\./);
  assert.match(body, /the german card of a page/);
  assert.match(body, /api 0\.16\.7 \(aaaaaaa\), extension 0\.16\.7 \(bbbbbbb, uncommitted changes\)/);
  assert.equal(/Ufer|secret prompt/.test(body), false, 'the public issue carries no page content and no logs');
  const shown = JSON.parse((await reports(databaseUrl, 'show', second.reportId)).out);
  assert.equal(shown.page.id, pageId, 'show gives the page as it was, here only');

  assert.match((await reports(databaseUrl, 'filed', second.reportId, '412')).out, /issue #412/);
  assert.equal((await store.report(second.reportId)).issue, 412);
  assert.deepEqual(await store.unfiledReports(), []);
  assert.equal((await reports(databaseUrl, 'filed', second.reportId, '413')).ok, false, 'a report is filed once');
  await assert.rejects(store.deleteReport('undo-two', second.reportId), { code: 'invalid' }, 'a filed report stays');
});

test('the report route adds the API build and the recent logs only when asked', async t => {
  const application = await createTestApplication(t);
  const url = await application.start({ port: 0 });
  t.after(() => application.close());
  const call = async (path, body, token) => {
    const response = await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await call('/api/reports', { operationId: 'r', text: 'x', screen: 'home', includeLogs: false })).status, 401);
  const { token } = (await call('/api/login', { username: 'admin', password: 'admin' })).data;

  const withLogs = await call('/api/reports', { operationId: 'with', text: 'The deck list jumps.', screen: 'home', extensionBuild, includeLogs: true }, token);
  assert.equal(withLogs.status, 200);
  const stored = await application.store.report(withLogs.data.reportId);
  assert.equal(JSON.parse(stored.builds).api.commit.length, 40, 'the API names its own build');
  assert.ok(Array.isArray(JSON.parse(stored.logs)), 'the logs are kept as a list');

  const without = await call('/api/reports', { operationId: 'without', text: 'No logs.', screen: 'home', includeLogs: false }, token);
  assert.equal((await application.store.report(without.data.reportId)).logs, null);
  assert.equal((await call('/api/reports', { operationId: 'bad', text: '', screen: 'home', includeLogs: false }, token)).status, 400);

  const undone = await call('/api/reports/delete', { operationId: 'undo', reportId: without.data.reportId }, token);
  assert.equal(undone.status, 200);
  await assert.rejects(application.store.report(without.data.reportId), { code: 'deleted' });
});
