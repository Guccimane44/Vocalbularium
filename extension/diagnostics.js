import { safeEvent, timeRange, withinRange, MAX_EVENT_BYTES, EXTENSION_LOG_BUDGET } from '../shared/diagnostics.mjs';

const requestValue = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Diagnostic transaction failed.'));
});

export function extensionDiagnostics({ upload, databaseName = 'vocabularium-diagnostics-v1', budgetBytes = EXTENSION_LOG_BUDGET } = {}) {
  let tail = Promise.resolve(), pending = 0, pendingBytes = 0, scheduled, flushing;
  let current = { enabled: true, bytes: 0, budgetBytes, degraded: false, reason: null, dropped: 0, mode: 'full' };
  const secrets = new Set();
  const database = (async () => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('events', { keyPath: 'eventId' });
      request.result.createObjectStore('state');
    };
    return requestValue(request);
  })();
  database.catch(() => { current.degraded = true; current.reason = 'storage_unavailable'; });
  const failure = reason => { current.degraded = true; current.reason = reason; current.dropped++; };
  function ordered(action) {
    const task = tail.then(action); tail = task.catch(() => failure('storage_unavailable')); return task;
  }
  async function transaction(mode, action) {
    const db = await database, tx = db.transaction(['events', 'state'], mode), complete = done(tx);
    try { const result = await action(tx.objectStore('events'), tx.objectStore('state')); await complete; return result; }
    catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await complete.catch(() => {}); throw error; }
  }
  async function readState(store) {
    const saved = await requestValue(store.get('policy'));
    return saved ?? { ...current, cleared: [] };
  }
  function record(input) {
    try {
      const event = safeEvent(input, { source: 'extension', mode: current.mode, secrets: [...secrets] });
      const bytes = new TextEncoder().encode(JSON.stringify(event)).length;
      if (bytes > MAX_EVENT_BYTES || pending >= 256 || pendingBytes + bytes > EXTENSION_LOG_BUDGET) { failure('buffer_full'); return; }
      pending++; pendingBytes += bytes;
      void ordered(() => transaction('readwrite', async (events, state) => {
        const policy = await readState(state);
        if (policy.cleared.some(range => withinRange(event.occurredAt, range))) return;
        if (await requestValue(events.get(event.eventId))) return;
        // A restarted worker must apply the persisted content policy before writing.
        const persisted = safeEvent(event, { source: 'extension', mode: policy.mode, secrets: [...secrets] });
        const storedBytes = new TextEncoder().encode(JSON.stringify(persisted)).length;
        if (policy.bytes + storedBytes > policy.budgetBytes) {
          policy.degraded = true; policy.reason = 'budget_full'; policy.dropped++; current = policy;
          await requestValue(state.put(policy, 'policy')); return;
        }
        await requestValue(events.put({ ...persisted, bytes: storedBytes }));
        policy.bytes += storedBytes;
        current = policy; await requestValue(state.put(policy, 'policy'));
      })).catch(() => {}).finally(() => { pending--; pendingBytes -= bytes; });
      schedule();
    } catch { failure('invalid_event'); }
  }
  function schedule() {
    if (scheduled || !upload) return;
    scheduled = setTimeout(() => { scheduled = undefined; void flush(); }, 250);
  }
  async function flush() {
    if (flushing || !upload) return flushing;
    flushing = ordered(async () => {
      const batch = await transaction('readonly', async events => {
        const items = await requestValue(events.getAll());
        let bytes = 0;
        return items.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).filter(item => {
          if (bytes + item.bytes > 6 * 1024 * 1024) return false;
          bytes += item.bytes; return true;
        }).slice(0, 32);
      });
      if (!batch.length) return;
      let response;
      try { response = await upload(batch.map(({ bytes, ...event }) => event)); }
      catch { current.degraded = true; current.reason = 'collection_unavailable'; return; }
      if (!response || !Array.isArray(response.accepted)) { current.degraded = true; current.reason = 'collection_unavailable'; return; }
      await transaction('readwrite', async (events, state) => {
        const policy = await readState(state), accepted = new Set(response.accepted);
        for (const item of batch) if (accepted.has(item.eventId)) {
          await requestValue(events.delete(item.eventId)); policy.bytes -= item.bytes;
        }
        policy.mode = response.status?.mode ?? policy.mode;
        const dropped = policy.dropped;
        const unreported = dropped - (policy.reported ?? 0);
        policy.reported = dropped;
        const localFull = policy.bytes >= policy.budgetBytes;
        policy.degraded = localFull || (response.status?.degraded ?? false);
        policy.reason = localFull ? 'budget_full' : response.status?.reason ?? null;
        current = policy; await requestValue(state.put(policy, 'policy'));
        if (unreported && !policy.degraded) record({ event: 'logging.gap', severity: 'warn', outcome: 'succeeded', dropped: unreported });
      });
      if (response.accepted.length) schedule();
    }).catch(() => {});
    try { await flushing; } finally { flushing = undefined; }
  }
  async function status() {
    try {
      await ordered(() => transaction('readonly', async (_events, state) => {
        const policy = await readState(state);
        current = { ...policy, degraded: current.degraded || policy.degraded, reason: current.reason ?? policy.reason };
      }));
    } catch { /* Failure state is still readable without IndexedDB. */ }
    return { ...current, buffered: pending };
  }
  async function cleanup(input) {
    const range = timeRange(input);
    return ordered(() => transaction('readwrite', async (events, state) => {
      const policy = await readState(state), items = await requestValue(events.getAll());
      let count = 0;
      for (const item of items) if (withinRange(item.occurredAt, range)) {
        await requestValue(events.delete(item.eventId)); policy.bytes -= item.bytes; count++;
      }
      // Backend deletion boundaries prevent resurrection; local buffers need only the most recent range.
      policy.cleared = [range]; policy.degraded = false; policy.reason = null;
      current = policy; await requestValue(state.put(policy, 'policy'));
      return { count, range, status: current };
    }));
  }
  async function configure({ budgetBytes: value }) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 1024 * 1024 * 1024) throw new Error('Buffer budget must be between 0 and 1024 MiB.');
    return ordered(() => transaction('readwrite', async (_events, state) => {
      const policy = await readState(state);
      policy.budgetBytes = value;
      policy.degraded = policy.bytes >= value;
      policy.reason = policy.degraded ? 'budget_full' : null;
      current = policy; await requestValue(state.put(policy, 'policy'));
      return { ...policy };
    }));
  }
  return { record, flush, status, cleanup, configure, addSecret: secret => { if (secret) secrets.add(secret); } };
}
