import { Postgres, OWNER_ACCOUNT_ID } from '../persistence/postgres.ts';
import { createHash, randomUUID } from 'node:crypto';
import { blockText, generationTargets, pageStatus, textBlocks, validateConfiguration } from '@vocabularium/domain/pages';
import { sortKey } from './sort-key.mjs';
/** @typedef {import('./store-records.js').PageRow} PageRow */
/** @typedef {import('./store-records.js').ComponentRow} ComponentRow */
/** @typedef {import('./store-records.js').AttemptRow} AttemptRow */
/** @typedef {import('./store-records.js').ReceiptRow} ReceiptRow */
export class StoreError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const fail = (code, message) => { throw new StoreError(code, message); };
const encodeCursor = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function decodeCursor(value, kind, sequence) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) fail('invalid', 'The list cursor is invalid.');
  let cursor;
  try { cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { fail('invalid', 'The list cursor is invalid.'); }
  if (!cursor || cursor.v !== 1 || cursor.kind !== kind || typeof cursor.id !== 'string' ||
    (typeof cursor.key !== 'string' && typeof cursor.key !== 'number') || !Number.isSafeInteger(cursor.sequence)) {
    fail('invalid', 'The list cursor is invalid.');
  }
  if (cursor.sequence !== sequence) fail('stale_cursor', 'The list changed. Start from its first page again.');
  return cursor;
}
function pageLimit(value, fallback, maximum) {
  if (value === undefined) return fallback;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) fail('invalid', `Choose a page size from 1 to ${maximum}.`);
  return limit;
}
const summaryFields = `b.id, b.deck_id, b.selected_text, b.created_at, b.main_key_sort_key,
  (SELECT k.content FROM components k WHERE k.page_id = b.id AND k.kind = 'main_key') AS main_key,
  (SELECT CASE WHEN BOOL_OR(q.status = 'failed') THEN 'failed'
    WHEN BOOL_OR(q.status = 'loading') THEN 'loading'
    WHEN COUNT(q.status) > 0 THEN 'completed' ELSE NULL END
    FROM components q WHERE q.page_id = b.id) AS status`;
const pageSummary = row => ({ id: row.id, deckId: row.deck_id, selectedText: row.selected_text, createdAt: row.created_at,
  mainKey: row.main_key ? blockText(JSON.parse(row.main_key)) : '', status: row.status });
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function blockValue(value, message) {
  if (!value || value.version !== 1 || !Array.isArray(value.blocks) ||
    value.blocks.some(block => !block || block.type !== 'paragraph' || typeof block.text !== 'string')) fail('invalid', message);
  return { version: 1, blocks: value.blocks.map(block => ({ type: 'paragraph', text: block.text })) };
}
function textValue(value, message) {
  if (typeof value !== 'string') fail('invalid', message);
  return value;
}
export const DEFAULT_DECK_MODULES = Object.freeze(['german-examples']);

// Account mutations are admitted synchronously and commit before acknowledgment.
// Provider work never runs inside the ordered executor or database transaction.
export class AccountStore {
  constructor(database, { outbox = null } = {}) {
    this.database = database;
    this.accountId = database.accountId;
    this.outbox = outbox;
  }
  static async open({ databaseUrl, accountId = OWNER_ACCOUNT_ID, outbox, diagnostic } = {}) {
    if (!databaseUrl)
      throw new Error('DATABASE_URL is required.');
    const database = new Postgres(databaseUrl, accountId, diagnostic);
    try {
      await database.initialize();
      const store = new AccountStore(database, { outbox });
      await database.transaction(async () => {
        if (!await database.one('SELECT id FROM account WHERE id = $1', [accountId])) {
          const deck = await store.createDeck('My Deck');
          await database.run('INSERT INTO account (id, default_deck_id) VALUES ($1, $2)', [accountId, deck.id]);
        }
      });
      return store;
    } catch (error) {
      await database.close(); throw error;
    }
  }
  close() { return this.database.close(); }
  ready() { return this.database.ready(); }
  ordered(action) { return this.database.ordered.run(action); }
  background(action) { return this.database.detached(action); }
  loadingAttempts() {
    return this.database.transaction(() => this.database.all("SELECT id, page_id, run_id, session_id, result FROM component_attempts WHERE state = 'loading'"));
  }
  async createDeck(name, types = DEFAULT_DECK_MODULES) {
    return this.database.transaction(async () => {
      const id = randomUUID();
      await this.database.run("INSERT INTO decks (id, name) VALUES ($1, $2)", [id, name]);
      for (const [position, type] of types.entries()) {
        await this.database.run("INSERT INTO deck_modules VALUES ($1, $2, $3, $4)", [randomUUID(), id, position, type]);
      }
      return await this.deck(id);
    });
  }
  async command(operationId, kind, payload, action) {
    if (typeof operationId !== 'string' || !operationId) fail('invalid', 'An operation ID is required.');
    const fingerprint = digest([kind, payload]);
    return this.database.transaction(async () => {
      const receipt = await this.database.one('SELECT * FROM receipts WHERE operation_id = $1', [operationId]);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) fail('operation_reused', 'Operation ID belongs to another change.');
        return { ...JSON.parse(receipt.result), sequence: Number(receipt.sequence), replayed: true };
      }
      const result = await action();
      const receiptRow = await this.database.one('INSERT INTO receipts (operation_id, fingerprint, result) VALUES ($1, $2, $3) RETURNING sequence', [operationId, fingerprint, JSON.stringify(result)]);
      return { ...result, sequence: Number(receiptRow.sequence), replayed: false };
    });
  }
  async openSession(operationId, session) {
    return await this.command(operationId, 'open-session', session, async () => {
      const { installationId, epoch, sessionId } = session;
      if (!installationId || !sessionId || !Number.isSafeInteger(epoch) || epoch < 1) {
        fail('invalid', 'A valid installation and browser session are required.');
      }
      const previous = await this.database.one("SELECT * FROM installations WHERE id = $1", [installationId]);
      if (previous && (previous.epoch > epoch || (previous.epoch === epoch && previous.session_id !== sessionId))) {
        fail('stale_session', 'This browser session has ended.');
      }
      if (previous && previous.session_id !== sessionId) {
        await this.database.run(`UPDATE components SET content = $2, status = 'failed' WHERE attempt_id IN
          (SELECT id FROM component_attempts WHERE installation_id = $1 AND state = 'loading')`, [installationId, JSON.stringify(textBlocks(''))]);
        await this.database.run(`UPDATE component_attempts SET state = 'failed', result = NULL
          WHERE installation_id = $1 AND state = 'loading'`, [installationId]);
      }
      await this.database.run(`INSERT INTO installations VALUES ($1, $2, $3)
        ON CONFLICT(id) DO UPDATE SET epoch = excluded.epoch, session_id = excluded.session_id`, [installationId, epoch, sessionId]);
      return { session };
    });
  }
  async requireSession(session) {
    return this.database.transaction(async () => {
      const current = await this.database.one("SELECT * FROM installations WHERE id = $1", [session.installationId]);
      if (!current || current.epoch !== session.epoch || current.session_id !== session.sessionId) {
        fail('stale_session', 'This browser session has ended.');
      }
    });
  }
  async deck(id) {
    return this.database.transaction(async () => {
      const deck = await this.database.one("SELECT id, name, view FROM decks WHERE id = $1", [id]);
      if (!deck) fail('deleted', 'The deck no longer exists.');
      const modules = await this.database.all("SELECT id, type FROM deck_modules WHERE deck_id = $1 ORDER BY position", [id]);
      return { id: deck.id, name: deck.name, modules: modules.map(({ id, type }) => ({ id, type })), view: { module: deck.view } };
    });
  }
  async snapshot() {
    return this.database.transaction(async () => {
      const { default_deck_id: id } = await this.database.one("SELECT * FROM account", []);
      const { modules } = await this.deck(id);
      return { id, modules };
    });
  }
  async account() {
    return this.database.transaction(async () => {
      const { default_deck_id: defaultDeckId } = await this.database.one("SELECT * FROM account", []);
      const decks = [];
      for (const { id } of await this.database.all('SELECT id FROM decks ORDER BY ordinal')) decks.push(await this.deck(id));
      return { defaultDeckId, decks, pages: (await this.pages()), sequence: await this.readSequence() };
    });
  }
  async readSequence() {
    const { sequence } = await this.database.one('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM receipts');
    return Number(sequence);
  }
  async listDecks({ cursor, limit } = {}) {
    return this.database.transaction(async () => {
      const size = pageLimit(limit, 40, 50);
      const sequence = await this.readSequence();
      const after = decodeCursor(cursor, 'decks', sequence);
      if (after && (!Number.isSafeInteger(after.key) || after.key < 0)) fail('invalid', 'The list cursor is invalid.');
      const rows = await this.database.all(`WITH bounded AS MATERIALIZED (
        SELECT id, name, ordinal FROM decks WHERE ordinal > $1 ORDER BY ordinal LIMIT $2
      ) SELECT b.id, b.name, b.ordinal,
        (SELECT COUNT(*) FROM deck_modules WHERE deck_id = b.id) AS module_count,
        (SELECT COUNT(*) FROM pages WHERE deck_id = b.id) AS page_count
        FROM bounded b ORDER BY b.ordinal`, [after?.key ?? 0, size + 1]);
      const visible = rows.slice(0, size);
      return {
        decks: visible.map(row => ({ id: row.id, name: row.name, moduleCount: Number(row.module_count), pageCount: Number(row.page_count) })),
        nextCursor: rows.length > size ? encodeCursor({ v: 1, kind: 'decks', sequence, key: visible.at(-1).ordinal, id: visible.at(-1).id }) : null,
        sequence
      };
    });
  }
  async summary() {
    return this.database.transaction(async () => {
      const { default_deck_id: defaultDeckId } = await this.database.one('SELECT default_deck_id FROM account WHERE id = $1', [this.accountId]);
      const listed = await this.listDecks();
      return { defaultDeckId, defaultDeckSnapshot: await this.deck(defaultDeckId), ...listed };
    });
  }
  async listPages(deckId, { order = 'newest', cursor, limit } = {}) {
    return this.database.transaction(async () => {
      await this.deck(deckId);
      const size = pageLimit(limit, 30, 50);
      if (!['newest', 'oldest', 'az', 'za'].includes(order)) fail('invalid', 'Choose a supported page order.');
      const sequence = await this.readSequence();
      const after = decodeCursor(cursor, `pages:${deckId}:${order}`, sequence);
      if (after && typeof after.key !== 'string') fail('invalid', 'The list cursor is invalid.');
      const alphabetic = order === 'az' || order === 'za';
      const column = alphabetic ? 'c.main_key_sort_key' : 'c.created_at COLLATE "C"';
      const direction = order === 'newest' || order === 'za' ? 'DESC' : 'ASC';
      const values = [deckId];
      let afterClause = '';
      if (after) {
        values.push(alphabetic ? Buffer.from(after.key, 'base64url') : after.key, after.id);
        afterClause = `AND (${column} ${direction === 'ASC' ? '>' : '<'} $2 OR
          (${column} = $2 AND c.id COLLATE "C" > $3 COLLATE "C"))`;
      }
      values.push(size + 1);
      const outerColumn = alphabetic ? 'b.main_key_sort_key' : 'b.created_at COLLATE "C"';
      const rows = await this.database.all(`WITH bounded AS MATERIALIZED (
        SELECT c.id, c.deck_id, c.selected_text, c.created_at, c.main_key_sort_key
        FROM pages c WHERE c.deck_id = $1 ${afterClause}
        ORDER BY ${column} ${direction}, c.id COLLATE "C" ASC LIMIT $${values.length}
      ) SELECT ${summaryFields} FROM bounded b
        ORDER BY ${outerColumn} ${direction}, b.id COLLATE "C" ASC`, values);
      const visible = rows.slice(0, size);
      const last = visible.at(-1);
      return {
        pages: visible.map(pageSummary),
        nextCursor: rows.length > size ? encodeCursor({ v: 1, kind: `pages:${deckId}:${order}`, sequence,
          key: alphabetic ? last.main_key_sort_key.toString('base64url') : last.created_at, id: last.id }) : null,
        sequence
      };
    });
  }
  async recentCaptures() {
    return this.database.transaction(async () => {
      const rows = await this.database.all(`WITH bounded AS MATERIALIZED (
        SELECT c.id, c.deck_id, c.selected_text, c.created_at, c.main_key_sort_key
        FROM pages c WHERE c.selected_text IS NOT NULL
        ORDER BY c.created_at COLLATE "C" DESC, c.id COLLATE "C" ASC LIMIT 20
      ) SELECT ${summaryFields} FROM bounded b
        ORDER BY b.created_at COLLATE "C" DESC, b.id COLLATE "C" ASC`);
      return { pages: rows.map(pageSummary), sequence: await this.readSequence() };
    });
  }
  async setDefault(operationId, deckId) {
    return await this.command(operationId, 'set-default', { deckId }, async () => {
      await this.deck(deckId);
      await this.database.run("UPDATE account SET default_deck_id = $1 WHERE id = 1", [deckId]);
      return { defaultDeckId: deckId };
    });
  }
  // Configuration edits change only subsequent generation; existing pages keep
  // their components, including those of removed instances.
  async saveDeck(operationId, { deck }) {
    return await this.command(operationId, 'save-deck', { deck }, async () => {
      if (!deck || typeof deck.name !== 'string' || !deck.name.trim() || !Array.isArray(deck.modules) ||
        deck.modules.some(module => !module || typeof module.id !== 'string' || !module.id || typeof module.type !== 'string')) {
        fail('invalid', 'Give the deck a name and choose supported modules.');
      }
      try { validateConfiguration(deck.modules); } catch (error) { fail('invalid', error.message); }
      if (deck.view !== undefined && deck.view?.module !== 'default') fail('invalid', 'Choose a supported view.');
      const current = deck.id ? (await this.deck(deck.id)) : null;
      const id = current?.id ?? randomUUID();
      for (const module of deck.modules) {
        const saved = await this.database.one("SELECT deck_id FROM deck_modules WHERE id = $1", [module.id]);
        if (saved && saved.deck_id !== id) fail('invalid', 'This module instance belongs to another deck.');
      }
      if (current) await this.database.run("UPDATE decks SET name = $1 WHERE id = $2", [deck.name.trim(), id]);
      else await this.database.run("INSERT INTO decks (id, name) VALUES ($1, $2)", [id, deck.name.trim()]);
      await this.database.run("DELETE FROM deck_modules WHERE deck_id = $1", [id]);
      for (const [position, module] of deck.modules.entries()) {
        await this.database.run("INSERT INTO deck_modules VALUES ($1, $2, $3, $4)", [module.id, id, position, module.type]);
      }
      return { deckId: id };
    });
  }
  async deleteDeck(operationId, { deckId, replacementId }) {
    return await this.command(operationId, 'delete-deck', { deckId, replacementId }, async () => {
      await this.deck(deckId);
      const { default_deck_id: defaultId } = await this.database.one("SELECT * FROM account", []);
      const other = await this.database.all("SELECT id FROM decks WHERE id != $1 ORDER BY ordinal", [deckId]);
      let nextDefault = defaultId;
      if (defaultId === deckId) {
        if (!other.length) nextDefault = (await this.createDeck('My Deck')).id;
        else {
          if (!other.some(deck => deck.id === replacementId)) fail('replacement', 'Choose another deck as the default.');
          nextDefault = replacementId;
        }
        await this.database.run("UPDATE account SET default_deck_id = $1 WHERE id = 1", [nextDefault]);
      }
      await this.database.run("DELETE FROM decks WHERE id = $1", [deckId]);
      return { deckId, defaultDeckId: nextDefault };
    });
  }
  async page(id) {
    return this.database.transaction(async () => {
      const page = await this.database.one("SELECT * FROM pages WHERE id = $1", [id]);
      if (!page) fail('deleted', 'The page no longer exists.');
      const configured = new Set((await this.database.all("SELECT id FROM deck_modules WHERE deck_id = $1", [page.deck_id])).map(row => row.id));
      const components = (await this.database.all("SELECT * FROM components WHERE page_id = $1 ORDER BY position", [id]))
        .map(row => ({ id: row.id, kind: row.kind, moduleInstanceId: row.module_instance_id, content: JSON.parse(row.content),
          status: row.status, attemptId: row.attempt_id, configured: row.kind !== 'module' || configured.has(row.module_instance_id) }));
      return { id: page.id, deckId: page.deck_id, selectedText: page.selected_text, createdAt: page.created_at,
        components, status: pageStatus(components) };
    });
  }
  async pages() {
    return this.database.transaction(async () => {
      const pages = [];
      for (const { id } of await this.database.all('SELECT id FROM pages ORDER BY created_at DESC, id')) pages.push(await this.page(id));
      return pages;
    });
  }
  async insertComponent(pageId, kind, content, moduleInstanceId = null) {
    const id = randomUUID();
    const { position } = await this.database.one('SELECT COALESCE(MAX(position) + 1, 0) AS position FROM components WHERE page_id = $1', [pageId]);
    await this.database.run(`INSERT INTO components (page_id, id, kind, module_instance_id, position, content)
      VALUES ($1, $2, $3, $4, $5, $6)`, [pageId, id, kind, moduleInstanceId, position, JSON.stringify(content)]);
    return id;
  }
  async insertPage(deckId, { selectedText, mainKey, context, manual = [] }) {
    if (typeof mainKey !== 'string' || !mainKey.trim()) fail('invalid', 'Enter a main key.');
    const id = randomUUID();
    await this.database.run("INSERT INTO pages (id, deck_id, selected_text, created_at, main_key_sort_key) VALUES ($1, $2, $3, $4, $5)",
      [id, deckId, selectedText, new Date().toISOString(), sortKey(mainKey)]);
    await this.insertComponent(id, 'main_key', textBlocks(mainKey));
    if (context) await this.insertComponent(id, 'context', textBlocks(context));
    for (const content of manual) await this.insertComponent(id, 'manual', content);
    return id;
  }
  async capture(operationId, { session, mainKey, context, snapshot }, { recoverySession } = {}) {
    return await this.command(operationId, 'capture', { session, mainKey, context, snapshot }, async () => {
      await this.requireSession(recoverySession ?? session);
      const interrupted = recoverySession && (recoverySession.sessionId !== session.sessionId || recoverySession.epoch !== session.epoch);
      if (recoverySession && (recoverySession.installationId !== session.installationId || recoverySession.epoch < session.epoch)) {
        fail('wrong_session', 'Capture recovery belongs to its originating installation.');
      }
      if (typeof mainKey !== 'string' || mainKey.length === 0) fail('invalid', 'Select some text first.');
      if (context !== undefined) textValue(context, 'Context must be text.');
      const deck = await this.deck(snapshot.id);
      const id = await this.insertPage(deck.id, { selectedText: mainKey, mainKey, context });
      // Capture follows the deck's current configuration, not the prepared snapshot.
      const { attemptIds } = await this.startRun(id, session, generationTargets({ scope: 'capture' }, deck.modules, []));
      if (interrupted) for (const attemptId of attemptIds) await this.failAttempt(attemptId);
      return { pageId: id, interrupted: Boolean(interrupted) };
    });
  }
  async prepareCapture(operationId, { session, mainKey }) {
    return await this.command(operationId, 'prepare-capture', { session, mainKey }, async () => {
      await this.requireSession(session);
      if (typeof mainKey !== 'string' || !mainKey.length) fail('invalid', 'Select some text first.');
      return { snapshot: (await this.snapshot()) };
    });
  }
  // One run per request: its attempts share one interpretation.
  async startRun(pageId, session, modules) {
    if (!modules.length) return { runId: null, attemptIds: [] };
    const runId = randomUUID();
    await this.database.run("INSERT INTO generation_runs (id, page_id) VALUES ($1, $2)", [runId, pageId]);
    const attemptIds = [];
    for (const module of modules) {
      const attemptId = randomUUID();
      const existing = await this.database.one("SELECT id FROM components WHERE page_id = $1 AND module_instance_id = $2", [pageId, module.id]);
      const componentId = existing?.id ?? await this.insertComponent(pageId, 'module', textBlocks(''), module.id);
      await this.database.run(`INSERT INTO component_attempts
        (id, page_id, component_id, run_id, installation_id, session_id, epoch, module) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [attemptId, pageId, componentId, runId, session.installationId, session.sessionId, session.epoch, JSON.stringify(module)]);
      await this.database.run("UPDATE components SET content = $1, status = 'loading', attempt_id = $2 WHERE page_id = $3 AND id = $4",
        [JSON.stringify(textBlocks('')), attemptId, pageId, componentId]);
      attemptIds.push(attemptId);
    }
    return { runId, attemptIds };
  }
  async attempt(id) {
    return this.database.transaction(async () => {
      const attempt = await this.database.one("SELECT * FROM component_attempts WHERE id = $1", [id]);
      if (!attempt) fail('deleted', 'The attempt no longer exists.');
      return { ...attempt, module: JSON.parse(attempt.module), result: attempt.result && JSON.parse(attempt.result) };
    });
  }
  async failAttempt(attemptId) {
    return this.database.transaction(async () => {
      await this.database.run("UPDATE components SET content = $2, status = 'failed' WHERE attempt_id = $1 AND status = 'loading'", [attemptId, JSON.stringify(textBlocks(''))]);
      await this.database.run("UPDATE component_attempts SET state = 'failed', result = NULL WHERE id = $1 AND state = 'loading'", [attemptId]);
    });
  }
  async run(id) {
    return this.database.transaction(async () => {
      const run = await this.database.one("SELECT * FROM generation_runs WHERE id = $1", [id]);
      if (!run) fail('deleted', 'The generation run no longer exists.');
      return { ...run, interpretation: run.interpretation ? JSON.parse(run.interpretation) : null };
    });
  }
  async establishInterpretation(runId, interpretation) {
    return this.database.transaction(async () => {
      const run = await this.run(runId);
      if (run.interpretation) return run.interpretation;
      const active = await this.database.one("SELECT id FROM component_attempts WHERE run_id = $1 AND state = 'loading' LIMIT 1", [runId]);
      if (!active) fail('stale_attempt', 'No active attempt requires this interpretation.');
      await this.database.run("UPDATE generation_runs SET interpretation = $1 WHERE id = $2 AND interpretation IS NULL", [JSON.stringify(interpretation), runId]);
      return interpretation;
    });
  }
  async pendingAttempts(session) {
    return this.database.transaction(async () => {
      await this.requireSession(session);
      const attempts = [];
      for (const { id } of await this.database.all("SELECT id FROM component_attempts WHERE installation_id = $1 AND session_id = $2 AND state = 'loading'", [session.installationId, session.sessionId])) attempts.push(await this.attempt(id));
      return attempts;
    });
  }
  // Provider completion only stages a result. It cannot publish component content.
  async stage(attemptId, result) {
    return this.database.transaction(async () => {
      const attempt = await this.attempt(attemptId);
      if (attempt.state !== 'loading' || attempt.result) fail('stale_attempt', 'The attempt no longer accepts results.');
      await this.requireSession({ installationId: attempt.installation_id, sessionId: attempt.session_id, epoch: attempt.epoch });
      if (typeof result.ok !== 'boolean' || (result.ok && typeof result.text !== 'string')) fail('invalid', 'Invalid component result.');
      await this.database.run("UPDATE component_attempts SET result = $1 WHERE id = $2", [JSON.stringify(result), attemptId]);
    });
  }
  async publish(operationId, { attemptId, session }) {
    return await this.command(operationId, 'publish', { attemptId, session }, async () => {
      await this.requireSession(session);
      const attempt = await this.attempt(attemptId);
      if (attempt.installation_id !== session.installationId || attempt.session_id !== session.sessionId) {
        fail('wrong_session', 'Only the originating browser session can publish this result.');
      }
      if (attempt.state !== 'loading' || !attempt.result) fail('stale_attempt', 'No current result is ready.');
      const state = attempt.result.ok ? 'completed' : 'failed';
      const content = textBlocks(attempt.result.ok ? attempt.result.text : '');
      const changed = await this.database.run(`UPDATE components SET content = $1, status = $2
        WHERE page_id = $3 AND id = $4 AND attempt_id = $5 AND status = 'loading'`, [JSON.stringify(content), state, attempt.page_id, attempt.component_id, attemptId]);
      if (!changed.rowCount) fail('stale_attempt', 'The component has moved on to another attempt.');
      await this.database.run("UPDATE component_attempts SET state = $1, result = NULL WHERE id = $2", [state, attemptId]);
      return { pageId: attempt.page_id, componentId: attempt.component_id, state };
    });
  }
  async savePage(operationId, { pageId, changes, added = [], context }) {
    return await this.command(operationId, 'save-page', { pageId, changes, added, context }, async () => {
      const page = await this.page(pageId);
      if (!Array.isArray(changes) || changes.some(change => !change || typeof change !== 'object') ||
        new Set(changes.map(change => change.componentId)).size !== changes.length || !Array.isArray(added)) fail('invalid', 'Choose each changed component once.');
      const updates = [];
      for (const change of changes) {
        const component = page.components.find(component => component.id === change.componentId);
        if (!component) fail('deleted', 'A changed component no longer exists.');
        if (component.status === 'loading') fail('generating', 'A component is still generating. Your drafts are preserved.');
        const content = blockValue(change.content, 'Component content must be a text document.');
        if (component.kind === 'main_key' && !blockText(content).trim()) fail('invalid', 'Enter a main key.');
        updates.push({ component, content });
      }
      const manual = added.map(content => blockValue(content, 'Component content must be a text document.'));
      let newContext = null;
      if (context !== undefined) {
        if (page.components.some(component => component.kind === 'context')) fail('invalid', 'This page already has Context. Edit it instead.');
        newContext = blockValue(context, 'Context must be a text document.');
      }
      for (const { component, content } of updates) {
        if (component.kind === 'context' && !blockText(content)) {
          await this.database.run("DELETE FROM components WHERE page_id = $1 AND id = $2", [pageId, component.id]);
          continue;
        }
        await this.database.run("UPDATE components SET content = $1 WHERE page_id = $2 AND id = $3", [JSON.stringify(content), pageId, component.id]);
        if (component.kind === 'main_key') await this.database.run("UPDATE pages SET main_key_sort_key = $1 WHERE id = $2", [sortKey(blockText(content)), pageId]);
      }
      if (newContext && blockText(newContext)) await this.insertComponent(pageId, 'context', newContext);
      for (const content of manual) await this.insertComponent(pageId, 'manual', content);
      return { pageId };
    });
  }
  async createPage(operationId, { deckId, mainKey, context, manual = [] }) {
    return await this.command(operationId, 'create-page', { deckId, mainKey, context, manual }, async () => {
      await this.deck(deckId);
      if (context !== undefined) textValue(context, 'Context must be text.');
      if (!Array.isArray(manual)) fail('invalid', 'Components must be text documents.');
      const documents = manual.map(content => blockValue(content, 'Components must be text documents.'));
      // Manual creation never starts generation.
      return { pageId: await this.insertPage(deckId, { selectedText: null, mainKey, context, manual: documents }) };
    });
  }
  // The content a confirmed retry replaces. The client shows it, then echoes the digest.
  confirmationDigest(page, modules) {
    return digest(modules.map(module => {
      const component = page.components.find(component => component.moduleInstanceId === module.id);
      return { moduleInstanceId: module.id, content: component?.content ?? null };
    }));
  }
  async generate(operationId, { pageId, target, session, confirmation }, { admit } = {}) {
    return await this.command(operationId, 'generate', { pageId, target, session, confirmation }, async () => {
      await this.requireSession(session);
      const page = await this.page(pageId);
      const deck = await this.deck(page.deckId);
      if (!target || !['missing', 'page', 'component'].includes(target.scope)) fail('invalid', 'Choose what to generate.');
      let modules;
      try { modules = generationTargets(target, deck.modules, page.components); }
      catch (error) { fail('invalid', error.message); }
      for (const module of modules) {
        if (page.components.some(component => component.moduleInstanceId === module.id && component.status === 'loading')) {
          fail('generating', 'A component is already generating.');
        }
      }
      if (target.scope !== 'missing') {
        const expected = this.confirmationDigest(page, modules);
        if (confirmation !== expected) {
          throw new StoreError('confirmation_required', 'Retry replaces this content, including your edits.', { confirmation: expected });
        }
      }
      admit?.(modules.length);
      return { pageId, attemptIds: (await this.startRun(pageId, session, modules)).attemptIds };
    });
  }
  async deletePage(operationId, pageId) {
    return await this.command(operationId, 'delete-page', { pageId }, async () => {
      await this.page(pageId);
      await this.database.run("DELETE FROM pages WHERE id = $1", [pageId]);
      return { pageId };
    });
  }
}
