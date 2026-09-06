import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startRun, resetRun } from '../isolation.mjs';
import { launchProfile } from '../browser.mjs';

const preset = {
  pages: [
    { language: 'en', role: 'essential', explanation: true, examples: false },
  ],
  examplePolicy: 'both',
  optionalVisibility: 'after',
};
async function preview(context, run) {
  const signin = await context.request.get(
    run.origin + '/signin-with-chatgpt',
    { maxRedirects: 0 },
  );
  assert.equal(signin.status(), 302);
  const auth = await context.request.post(run.origin + '/api/auth/preview', {
    data: {},
  });
  assert.equal(auth.status(), 200);
}
async function state(context, run) {
  const response = await context.request.get(run.origin + '/api/sync');
  assert.equal(response.status(), 200);
  return response.json();
}
async function mutate(context, run, type, payload) {
  const response = await context.request.post(run.origin + '/api/mutations', {
    data: { id: randomUUID(), type, deviceId: 'isolation-proof', payload },
  });
  assert.equal(response.status(), 200);
  return response.json();
}
async function extensionWorker(context) {
  return (
    context
      .serviceWorkers()
      .find((w) => w.url().startsWith('chrome-extension:')) ??
    (await context.waitForEvent('serviceworker', {
      predicate: (w) => w.url().startsWith('chrome-extension:'),
    }))
  );
}
async function setBrowserMarkers(page, id) {
  await page.waitForFunction(() => localStorage.getItem('vocab-active-owner'));
  await page.evaluate(async (id) => {
    localStorage.setItem('isolation-proof', id);
    const cache = await caches.open('isolation-proof');
    await cache.put('/isolation-proof', new Response(id));
    await new Promise((yes, no) => {
      const request = indexedDB.open('vocabularium-device-v1', 1);
      request.onerror = () => no(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['snapshots', 'outbox'], 'readwrite');
        tx.objectStore('snapshots').put(id, '__isolation-proof');
        tx.objectStore('outbox').put({
          id: 'isolation-proof',
          owner: id,
          mutation: {},
        });
        tx.oncomplete = () => {
          db.close();
          yes();
        };
        tx.onerror = () => no(tx.error);
      };
    });
  }, id);
}
async function browserMarkers(page) {
  return page.evaluate(async () => {
    const cache = await caches.open('isolation-proof');
    const cached = await cache.match('/isolation-proof');
    const local = localStorage.getItem('isolation-proof');
    const idb = await new Promise((yes, no) => {
      const request = indexedDB.open('vocabularium-device-v1', 1);
      request.onerror = () => no(request.error);
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction(['snapshots', 'outbox']);
        const snapshot = tx.objectStore('snapshots').get('__isolation-proof');
        const outbox = tx.objectStore('outbox').get('isolation-proof');
        tx.oncomplete = () => {
          db.close();
          yes([snapshot.result ?? null, outbox.result?.owner ?? null]);
        };
        tx.onerror = () => no(tx.error);
      };
    });
    return { local, cache: cached ? await cached.text() : null, idb };
  });
}

test(
  'two real runtimes isolate D1, browser storage, extension profiles and cleanup',
  { timeout: 240_000 },
  async (t) => {
    const suffix = randomUUID().slice(0, 8),
      runs = [],
      contexts = [];
    t.after(async () => {
      for (const context of contexts) await context.close().catch(() => {});
      for (const run of runs) {
        await run.stop();
        if (existsSync(run.dir)) await resetRun(run.id);
      }
    });
    const results = await Promise.allSettled(
      ['a', 'b'].map(async (label) => {
        const run = await startRun({ id: `proof-${label}-${suffix}` });
        runs.push(run);
        return run;
      }),
    );
    for (const result of results)
      if (result.status === 'rejected') throw result.reason;
    let [a, b] = results.map((r) => r.value);
    await assert.rejects(startRun({ id: a.id }), /already exists/);
    assert.notEqual(a.origin, b.origin);
    let ca = await launchProfile(a);
    contexts.push(ca);
    const cb = await launchProfile(b);
    contexts.push(cb);
    for (const [context, run, name] of [
      [ca, a, 'A only'],
      [cb, b, 'B only'],
    ]) {
      await preview(context, run);
      const config = await (
        await context.request.get(run.origin + '/api/auth/config')
      ).json();
      assert.equal(config.generation, false);
      assert.equal(config.email, false);
      assert.equal(config.apple, false);
      const created = await mutate(context, run, 'createList', {
        name,
        preset,
      });
      await mutate(context, run, 'capture', {
        expression: 'bank',
        listId: created.result.listId,
      });
    }
    assert.deepEqual(
      (await state(ca, a)).lists.map((l) => l.name),
      ['A only'],
    );
    assert.deepEqual(
      (await state(cb, b)).lists.map((l) => l.name),
      ['B only'],
    );
    const pa = await ca.newPage(),
      pb = await cb.newPage();
    await Promise.all([pa.goto(a.origin), pb.goto(b.origin)]);
    await setBrowserMarkers(pa, 'A');
    await pb.waitForFunction(() => localStorage.getItem('vocab-active-owner'));
    assert.deepEqual(await browserMarkers(pb), {
      local: null,
      cache: null,
      idb: [null, null],
    });
    await setBrowserMarkers(pb, 'B');
    await ca.addCookies([
      { name: 'isolation-proof', value: 'A', url: a.origin },
    ]);
    assert.ok(!(await cb.cookies()).some((c) => c.name === 'isolation-proof'));
    const wa = await extensionWorker(ca),
      wb = await extensionWorker(cb);
    await wa.evaluate(() => chrome.storage.local.set({ isolationProof: 'A' }));
    assert.equal(
      await wb.evaluate(
        async () =>
          (await chrome.storage.local.get('isolationProof')).isolationProof ??
          null,
      ),
      null,
    );
    await wb.evaluate(() => chrome.storage.local.set({ isolationProof: 'B' }));
    await ca.close();
    await a.stop();
    a = await startRun({ id: a.id, resume: true });
    runs.push(a);
    ca = await launchProfile(a);
    contexts.push(ca);
    const resumed = await ca.newPage();
    await resumed.goto(a.origin);
    assert.deepEqual(
      (await state(ca, a)).lists.map((l) => l.name),
      ['A only'],
    );
    assert.deepEqual(await browserMarkers(resumed), {
      local: 'A',
      cache: 'A',
      idb: ['A', 'A'],
    });
    assert.equal(
      await (
        await extensionWorker(ca)
      ).evaluate(
        async () =>
          (await chrome.storage.local.get('isolationProof')).isolationProof,
      ),
      'A',
    );
    await ca.close();
    await resetRun(a.id);
    assert.equal(existsSync(a.dir), false);
    assert.deepEqual(
      (await state(cb, b)).lists.map((l) => l.name),
      ['B only'],
    );
    assert.deepEqual(await browserMarkers(pb), {
      local: 'B',
      cache: 'B',
      idb: ['B', 'B'],
    });
    assert.equal(
      await wb.evaluate(
        async () =>
          (await chrome.storage.local.get('isolationProof')).isolationProof,
      ),
      'B',
    );
    assert.ok(
      !readFileSync(join(b.dir, 'runtime.log'), 'utf8').includes(
        'ISOLATION_SECRET_SENTINEL',
      ),
    );
  },
);
