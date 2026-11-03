// @ts-check
import { mkdir, readdir, readFile, rename, rm, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { safeEvent, timeRange, withinRange, MAX_EVENT_BYTES } from '../../shared/diagnostics.mjs';

// A stored event, as safeEvent returns it, with the time the collector received it.
/** @typedef {Record<string, unknown> & { eventId: string, occurredAt: string, receivedAt?: string, event: string }} DiagnosticEvent */
/** @typedef {DiagnosticEvent & { receivedAt: string }} StoredEvent */
/** @typedef {{ from: string, to: string }} TimeRange */
// What inspection reads by: a time range or its ends, an identity, a count.
/** @typedef {{ range?: TimeRange, from?: string, to?: string, limit?: unknown, operationId?: string, requestId?: string, pageId?: string, attemptId?: string }} DiagnosticFilter */
/** @typedef {{ generation: string, cleared: TimeRange[] }} DiagnosticControl */
/** @typedef {Error & { code?: string }} SystemError */

const defaultBudget = 256 * 1024 * 1024;
const segmentBytes = 8 * 1024 * 1024;
/** @type {AsyncLocalStorage<Record<string, unknown>>} */
export const diagnosticContext = new AsyncLocalStorage();
/** @param {string} path @param {string} data */
async function privateWrite(path, data) {
  const handle = await open(path, 'w', 0o600);
  try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
}
/** @param {TimeRange[]} ranges */
function mergeRanges(ranges) {
  /** @type {TimeRange[]} */
  const merged = [];
  for (const range of ranges.sort((a, b) => a.from.localeCompare(b.from))) {
    const previous = merged.at(-1);
    if (previous && range.from <= previous.to) previous.to = previous.to > range.to ? previous.to : range.to;
    else merged.push({ ...range });
  }
  return merged;
}

export class Diagnostics {
  /** @param {{ directory?: string, budgetBytes?: number, mode?: string, secrets?: unknown[] }} [options] */
  constructor({ directory, budgetBytes = defaultBudget, mode = 'full', secrets = [] } = {}) {
    this.directory = directory; this.budgetBytes = budgetBytes; this.mode = mode;
    /** @type {Promise<unknown>} */
    this.tail = Promise.resolve();
    /** @type {Set<string>} */
    this.secrets = new Set(/** @type {string[]} */ (secrets.filter(Boolean)));
    /** @type {DiagnosticControl} */
    this.control = { generation: randomUUID(), cleared: [] };
    /** @type {Set<string>} */
    this.ids = new Set();
    this.bytes = 0; this.segment = 0; this.segmentSize = 0; this.pending = 0; this.pendingBytes = 0;
    /** @type {string | null} */
    this.reason = null; this.dropped = 0; this.closed = false;
    this.initialized = false;
    /** @type {import('node:fs/promises').FileHandle | null | undefined} */
    this.lock = undefined;
    this.ready = this.initialize().catch(async () => { this.reason = 'storage_unavailable'; await this.releaseLock(); });
  }
  /** @param {unknown} secret */
  addSecret(secret) { if (typeof secret === 'string' && secret) this.secrets.add(secret); }
  async initialize() {
    if (!this.directory) { this.initialized = true; return; }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lockPath = join(this.directory, 'collector.lock');
    try { this.lock = await open(lockPath, 'wx', 0o600); }
    catch (error) {
      if (/** @type {SystemError} */ (error).code !== 'EEXIST') throw error;
      const owner = JSON.parse(await readFile(lockPath, 'utf8'));
      try { process.kill(owner.pid, 0); throw new Error('Diagnostic collector already running.'); }
      catch (probe) { if (/** @type {SystemError} */ (probe).code !== 'ESRCH') throw probe; }
      await rm(lockPath); this.lock = await open(lockPath, 'wx', 0o600);
    }
    await this.lock.writeFile(JSON.stringify({ pid: process.pid })); await this.lock.sync();
    try {
      const control = JSON.parse(await readFile(join(this.directory, 'control.json'), 'utf8'));
      if (!/^[\da-f-]{36}$/.test(control.generation) || !Array.isArray(control.cleared)) throw new Error('Invalid diagnostic manifest.');
      this.control = { generation: control.generation, cleared: control.cleared.map(timeRange) };
    } catch (error) {
      if (/** @type {SystemError} */ (error).code !== 'ENOENT') throw error;
      await this.saveControl(this.control);
    }
    await mkdir(this.generationDirectory(), { recursive: true, mode: 0o700 });
    for (const entry of await readdir(this.directory)) {
      if (/^[\da-f-]{36}$/.test(entry) && entry !== this.control.generation) await rm(join(this.directory, entry), { recursive: true, force: true });
    }
    const files = await this.files();
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      this.bytes += Buffer.byteLength(content);
      for (const line of content.split('\n').filter(Boolean)) {
        try { this.ids.add(JSON.parse(line).eventId); } catch { this.reason = 'incomplete_segment'; this.dropped++; }
      }
    }
    this.segment = files.length;
    // Always use a fresh segment after restart, including after a partial last write.
    if (this.bytes >= this.budgetBytes) this.reason = 'budget_full';
    this.initialized = true;
  }
  // Only called once a directory is set.
  generationDirectory(generation = this.control.generation) { return join(/** @type {string} */ (this.directory), generation); }
  async files() {
    if (!this.directory) return [];
    return (await readdir(this.generationDirectory())).filter(name => /^segment-\d{6}\.ndjson$/.test(name)).sort()
      .map(name => join(this.generationDirectory(), name));
  }
  /** @param {DiagnosticControl} control */
  async saveControl(control) {
    const data = JSON.stringify(control);
    if (Buffer.byteLength(data) > 64 * 1024) throw new Error('Cleanup history is full.');
    const path = join(/** @type {string} */ (this.directory), 'control.json');
    await privateWrite(path + '.tmp', data); await rename(path + '.tmp', path);
  }
  /** @template T @param {() => T | Promise<T>} action @returns {Promise<T>} */
  ordered(action) {
    const task = this.tail.then(() => this.ready).then(action);
    this.tail = task.catch(() => {}); return task;
  }
  status() {
    return { enabled: Boolean(this.directory), mode: this.mode, bytes: this.bytes, budgetBytes: this.budgetBytes,
      buffered: this.pending, degraded: Boolean(this.reason), reason: this.reason, dropped: this.dropped };
  }
  /** @param {Record<string, unknown>} input */
  emit(input) {
    if (!this.directory || this.closed) return;
    try {
      const event = safeEvent(input, { mode: this.mode, secrets: [...this.secrets] });
      const bytes = Buffer.byteLength(JSON.stringify(event));
      if (bytes > MAX_EVENT_BYTES || this.pending >= 256 || this.pendingBytes + bytes > 16 * 1024 * 1024) {
        this.reason = bytes > MAX_EVENT_BYTES ? 'event_too_large' : 'buffer_full'; this.dropped++; return;
      }
      this.pending++; this.pendingBytes += bytes;
      void this.ordered(() => this.append(event)).catch(() => { this.reason = 'storage_unavailable'; this.dropped++; })
        .finally(() => { this.pending--; this.pendingBytes -= bytes; });
    } catch { this.reason = 'invalid_event'; this.dropped++; }
  }
  /** @param {DiagnosticEvent} event */
  async append(event) {
    if (!this.initialized) return 'unavailable';
    if (this.control.cleared.some(range => withinRange(event.occurredAt, range))) return 'cleared';
    if (this.ids.has(event.eventId)) return 'duplicate';
    if (!this.directory) return 'unavailable';
    const line = JSON.stringify({ ...event, receivedAt: event.receivedAt ?? new Date().toISOString() }) + '\n';
    const size = Buffer.byteLength(line);
    if (size > MAX_EVENT_BYTES || this.bytes + size > this.budgetBytes) {
      this.reason = size > MAX_EVENT_BYTES ? 'event_too_large' : 'budget_full'; this.dropped++; return 'full';
    }
    await mkdir(this.generationDirectory(), { recursive: true, mode: 0o700 });
    if (this.segmentSize + size > segmentBytes) { this.segment++; this.segmentSize = 0; }
    const handle = await open(join(this.generationDirectory(), `segment-${String(this.segment).padStart(6, '0')}.ndjson`), 'a', 0o600);
    try { await handle.writeFile(line); await handle.sync(); }
    catch (error) {
      // A partial append must never become the prefix of a later acknowledged event.
      const written = await handle.stat().catch(() => null);
      if (written) this.bytes += Math.max(0, written.size - this.segmentSize);
      this.segment++; this.segmentSize = 0;
      throw error;
    }
    finally { await handle.close(); }
    this.ids.add(event.eventId); this.bytes += size; this.segmentSize += size;
    if (this.reason && this.reason !== 'incomplete_segment') {
      const dropped = this.dropped; this.reason = null;
      if (event.event !== 'logging.gap') this.emit({ event: 'logging.gap', outcome: 'succeeded', severity: 'warn', dropped });
    }
    return 'stored';
  }
  /** @param {unknown} events */
  ingest(events) {
    if (!Array.isArray(events) || events.length > 32) throw new Error('Send at most 32 diagnostic events.');
    // Validate the complete batch before writing; do not accept arbitrary raw log objects.
    const normalized = events.map(event => safeEvent(event, { source: 'extension', mode: this.mode, secrets: [...this.secrets] }));
    return this.ordered(async () => {
      /** @type {string[]} */
      const accepted = [];
      for (const event of normalized) {
        try { if (['stored', 'duplicate', 'cleared'].includes(await this.append(event))) accepted.push(event.eventId); }
        catch { this.reason = 'storage_unavailable'; this.dropped++; break; }
      }
      return { accepted, status: this.status() };
    });
  }
  /** @param {DiagnosticFilter} [filter] */
  async entries(filter = {}) {
    if (!this.initialized) throw new Error('Diagnostic storage is unavailable.');
    /** @type {StoredEvent[]} */
    const result = [];
    const seen = new Set();
    for (const file of await this.files()) {
      for (const line of (await readFile(file, 'utf8')).split('\n').filter(Boolean)) {
        /** @type {StoredEvent} */
        let event; try { event = JSON.parse(line); } catch { continue; }
        if (seen.has(event.eventId)) continue;
        seen.add(event.eventId);
        if (filter.range && !withinRange(event.occurredAt, filter.range)) continue;
        if (/** @type {const} */ (['operationId', 'requestId', 'pageId', 'attemptId']).some(key => filter[key] && event[key] !== filter[key])) continue;
        result.push(event);
      }
    }
    return result.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.receivedAt.localeCompare(b.receivedAt));
  }
  /** @param {DiagnosticFilter} [filter] */
  inspect(filter = {}) {
    return this.ordered(async () => {
      const limit = filter.limit === undefined ? 200 : Number(filter.limit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Choose a limit from 1 to 1000.');
      const range = filter.from || filter.to ? timeRange(filter) : undefined;
      const events = await this.entries({ ...filter, range });
      return { events: events.slice(-limit), status: this.status() };
    });
  }
  /** @param {{ from?: string, to?: string }} [input] */
  cleanup(input = {}, preview = false) {
    const range = timeRange(input);
    return this.ordered(async () => {
      const entries = await this.entries();
      const removed = entries.filter(event => withinRange(event.occurredAt, range));
      const result = { range, count: removed.length, bytes: removed.reduce((sum, event) => sum + Buffer.byteLength(JSON.stringify(event) + '\n'), 0) };
      if (preview) return result;
      const control = { generation: randomUUID(), cleared: mergeRanges([...this.control.cleared, range]) };
      const directory = this.generationDirectory(control.generation);
      await mkdir(directory, { mode: 0o700 });
      let size = 0, segment = 0, total = 0;
      try {
        for (const event of entries.filter(event => !withinRange(event.occurredAt, range))) {
          const line = JSON.stringify(event) + '\n', bytes = Buffer.byteLength(line);
          if (size + bytes > segmentBytes) { segment++; size = 0; }
          const handle = await open(join(directory, `segment-${String(segment).padStart(6, '0')}.ndjson`), 'a', 0o600);
          try { await handle.writeFile(line); await handle.sync(); } finally { await handle.close(); }
          size += bytes; total += bytes;
        }
        await this.saveControl(control);
      } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
      const old = this.generationDirectory(); this.control = control;
      this.bytes = total; this.segment = segment; this.segmentSize = size;
      this.ids = new Set(entries.filter(event => !withinRange(event.occurredAt, range)).map(event => event.eventId));
      this.reason = null;
      await rm(old, { recursive: true, force: true }).catch(() => { this.reason = 'cleanup_incomplete'; });
      return { ...result, status: this.status() };
    });
  }
  async releaseLock() {
    if (!this.lock) return;
    await this.lock.close(); this.lock = null;
    await rm(join(/** @type {string} */ (this.directory), 'collector.lock'), { force: true });
  }
  async close() {
    if (this.closed) return;
    await this.ready;
    let pending;
    do { pending = this.tail; await pending; } while (pending !== this.tail);
    this.closed = true; await this.releaseLock();
  }
}
