import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Diagnostics } from '../src/server/diagnostics.mjs';
import { safeEvent } from '../shared/diagnostics.mjs';

const sample = extra => ({ event: 'capture.invoked', eventId: crypto.randomUUID(), occurredAt: '2026-10-02T00:00:00.000Z',
  outcome: 'started', operationId: 'fixture-capture', content: { selectedText: '幸福' }, ...extra });
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-logs-'));
  const diagnostics = new Diagnostics({ directory, ...options }); await diagnostics.ready;
  t.after(async () => { await diagnostics.close(); await rm(directory, { recursive: true, force: true }); });
  return diagnostics;
}
test('logs retain full content, exclude credentials and manual text, and support metadata mode', () => {
  const input = sample({ authorization: 'token', password: 'password', content: { selectedText: 'secret-key selection', password: 'password' } });
  const event = safeEvent(input, { secrets: ['secret-key'] });
  assert.equal(event.content.selectedText, '[REDACTED] selection');
  assert.equal(event.password, undefined); assert.equal(event.authorization, undefined);
  assert.equal(event.content.password, undefined);
  assert.equal(safeEvent(sample(), { mode: 'metadata' }).content, undefined);
  assert.equal(safeEvent(sample({ event: 'api.completed' })).content, undefined);
});
test('acknowledged events survive restart; redelivery does not duplicate them', async t => {
  const store = await fixture(t), event = sample();
  assert.deepEqual((await store.ingest([event])).accepted, [event.eventId]);
  await store.close();
  const reopened = new Diagnostics({ directory: store.directory }); await reopened.ready;
  t.after(() => reopened.close());
  assert.deepEqual((await reopened.ingest([event])).accepted, [event.eventId]);
  assert.equal((await reopened.inspect()).events.length, 1);
});
test('cleanup previews, retains other periods, and prevents stale offline uploads after restart', async t => {
  const store = await fixture(t), old = sample(), later = sample({ occurredAt: '2026-10-03T00:00:00.000Z' });
  await store.ingest([old, later]);
  const range = { from: '2026-10-02T00:00:00.000Z', to: '2026-10-02T23:59:59.999Z' };
  assert.equal((await store.cleanup(range, true)).count, 1);
  assert.equal((await store.inspect()).events.length, 2);
  await store.cleanup(range); await store.close();
  const reopened = new Diagnostics({ directory: store.directory }); await reopened.ready;
  t.after(() => reopened.close());
  assert.equal((await reopened.ingest([sample(), old])).accepted.length, 2);
  assert.deepEqual((await reopened.inspect()).events.map(event => event.eventId), [later.eventId]);
});
test('full budget preserves existing evidence, reports missing evidence, and resumes after cleanup', async t => {
  const store = await fixture(t, { budgetBytes: 650 });
  await store.ingest([sample()]);
  assert.equal((await store.ingest([sample({ content: { selectedText: 'x'.repeat(1000) } })])).accepted.length, 0);
  assert.equal(store.status().reason, 'budget_full');
  assert.equal((await store.inspect()).events.length, 1);
  await store.cleanup();
  const future = sample({ occurredAt: new Date(Date.now() + 1000).toISOString() });
  assert.deepEqual((await store.ingest([future])).accepted, [future.eventId]);
  assert.equal(store.status().degraded, false);
});
test('malformed batch writes nothing; damaged segment is reported and a later segment remains readable', async t => {
  const store = await fixture(t);
  assert.throws(() => store.ingest([sample(), { event: 'unknown' }]));
  assert.equal((await store.inspect()).events.length, 0);
  await store.ingest([sample()]); await store.close();
  await writeFile((await store.files())[0], '{partial');
  const reopened = new Diagnostics({ directory: store.directory }); await reopened.ready;
  t.after(() => reopened.close());
  assert.equal(reopened.status().reason, 'incomplete_segment');
  await reopened.ingest([sample()]);
  assert.equal((await reopened.inspect()).events.length, 1);
});
