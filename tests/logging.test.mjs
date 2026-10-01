import test, { createTestApplication } from './helpers/database.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Diagnostics } from '../src/server/diagnostics.mjs';
import { OpenCodeProvider } from '../src/server/opencode.mjs';

const session = { installationId: 'logging-installation', sessionId: 'logging-browser', epoch: 1 };
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'vocabularium-integrated-logs-'));
  const diagnostics = new Diagnostics({ directory, ...options.diagnosticOptions });
  const provider = new OpenCodeProvider({ apiKey: 'synthetic-api-secret', fetchImpl: async (_url, request) => {
    const input = JSON.parse(request.body);
    await new Promise(resolve => setTimeout(resolve, 15));
    const interpretation = input.messages[0].content.includes('vocabulary_interpretation');
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: {
      role: 'assistant', content: options.invalid ? 'invalid-output-fixture' : JSON.stringify(interpretation
        ? { inputType: 'word_phrase', sourceLanguage: 'Chinese' } : { text: 'unexpected-output-fixture' })
    } }] }), { headers: { 'Content-Type': 'application/json' } });
  } });
  const application = await createTestApplication(t, { diagnostics, provider });
  const url = await application.start({ port: 0 });
  t.after(async () => { await application.close(); await rm(directory, { recursive: true, force: true }); });
  let token;
  async function call(path, body) {
    const response = await fetch(url + path, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Vocabularium-Terminology': 'karte-seite', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { response, value: await response.json() };
  }
  token = (await call('/api/login', { username: 'admin', password: 'admin' })).value.token;
  await call('/api/session', { operationId: 'logging-session', session });
  async function capture() {
    const result = await call('/api/capture', { operationId: 'logging-capture', payload: { session,
      selectedText: '幸福 synthetic-api-secret', snapshot: await application.store.snapshot() } });
    assert.equal(result.response.status, 200);
    await Promise.all([...application.generation.tasks.values()].map(item => item.task));
    for (const attempt of await application.store.pendingAttempts(session)) {
      await call('/api/publish', { operationId: `publish-${attempt.id}`, payload: { attemptId: attempt.id, session } });
    }
    return result.value.karteId;
  }
  return { application, diagnostics, url, token, call, capture };
}

test('diagnostic history joins capture, actual prompts, phase timings and committed publication; manual text and secrets stay out', async t => {
  const { application, diagnostics, call, capture, token } = await fixture(t);
  const karteId = await capture();
  const karte = await application.store.karte(karteId);
  await call('/api/karte/save', { operationId: 'manual-edit-fixture', payload: { karteId,
    changes: [{ seiteId: karte.seites[0].seite_id, text: 'MANUAL-PRIVATE-ONLY' }] } });
  const manual = await call('/api/karte/create', { operationId: 'manual-create-fixture', payload: {
    deckId: karte.deck_id, seites: [{ seiteId: karte.seites[0].seite_id, text: 'MANUAL-PRIVATE-ONLY' }] }
  });
  assert.equal(manual.response.status, 200);
  assert.equal((await call('/api/karte/delete', { operationId: 'manual-delete-fixture', payload: { karteId: manual.value.karteId } })).response.status, 200);
  const events = (await diagnostics.inspect({ karteId })).events;
  assert.ok(events.some(event => event.event === 'capture.saved' && event.operationId === 'logging-capture'));
  assert.ok(events.some(event => event.event === 'provider.request' && event.content.prompts.length === 2 && event.model));
  assert.ok(events.some(event => event.event === 'provider.response' && event.durationMs >= 10));
  assert.ok(events.some(event => event.event === 'generation.work' && event.phase === 'staged' && event.outcome === 'succeeded'));
  assert.ok(events.some(event => event.route === '/api/publish' && event.outcome === 'succeeded' && event.attemptId));
  assert.ok(events.some(event => event.event === 'api.completed' && event.operationId === 'manual-edit-fixture'));
  const serialized = JSON.stringify((await diagnostics.inspect({ limit: 1000 })).events);
  for (const forbidden of [token, 'synthetic-api-secret', 'MANUAL-PRIVATE-ONLY']) assert.equal(serialized.includes(forbidden), false);
  assert.ok(serialized.includes('[REDACTED]'));
});
test('invalid generation output remains inspectable with a failed provider and final failed outcome', async t => {
  const { application, diagnostics, capture } = await fixture(t, { invalid: true });
  const karteId = await capture();
  assert.equal((await application.store.karte(karteId)).status, 'failed');
  const events = (await diagnostics.inspect({ karteId })).events;
  assert.ok(events.some(event => event.event === 'provider.response' && event.outcome === 'failed' && event.content.output.includes('invalid-output-fixture')));
  assert.ok(events.some(event => event.event === 'generation.work' && event.phase === 'settled' && event.outcome === 'failed'));
});
test('diagnostic budget and write failures do not prevent capture, generation or manual saves', async t => {
  const { application, diagnostics, capture, call } = await fixture(t, { diagnosticOptions: { budgetBytes: 0 } });
  const karteId = await capture();
  const karte = await application.store.karte(karteId);
  assert.equal(karte.status, 'completed');
  assert.equal((await call('/api/karte/save', { operationId: 'full-budget-edit', payload: { karteId,
    changes: [{ seiteId: karte.seites[0].seite_id, text: 'saved despite log capacity' }] } })).response.status, 200);
  assert.equal((await call('/api/diagnostics/status')).value.degraded, true);
  diagnostics.budgetBytes = 1024 * 1024;
  await rm(diagnostics.generationDirectory(), { recursive: true, force: true });
  await writeFile(diagnostics.generationDirectory(), 'controlled logging filesystem failure');
  assert.equal((await call('/api/karte/save', { operationId: 'failed-writer-edit', payload: { karteId,
    changes: [{ seiteId: karte.seites[0].seite_id, text: 'saved despite log writer failure' }] } })).response.status, 200);
  await diagnostics.tail;
  assert.equal(diagnostics.status().reason, 'storage_unavailable');
  assert.equal((await application.store.karte(karteId)).seites[0].text, 'saved despite log writer failure');
});
test('authenticated management and the Codex command share inspection, preview and deletion rules', async t => {
  const { diagnostics, url, call, capture } = await fixture(t);
  const karteId = await capture();
  const unauthenticated = await fetch(url + '/api/diagnostics/events');
  assert.equal(unauthenticated.status, 401);
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/logs.mjs', 'inspect', '--karte-id', karteId],
    { env: { ...process.env, VOCABULARIUM_API_URL: url } });
  assert.ok(JSON.parse(stdout).events.some(event => event.karteId === karteId));
  const range = { from: '1970-01-01T00:00:00Z', to: new Date(Date.now() + 1000).toISOString() };
  const before = (await diagnostics.inspect()).events.length;
  assert.equal((await call('/api/diagnostics/cleanup', { ...range, preview: true })).value.count, before);
  assert.equal((await diagnostics.inspect()).events.length, before);
  assert.equal((await call('/api/diagnostics/cleanup', range)).response.status, 200);
  assert.equal((await diagnostics.inspect()).events.length, 0);
});
