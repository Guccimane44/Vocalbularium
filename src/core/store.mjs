import { Postgres, OWNER_ACCOUNT_ID } from '../persistence/postgres.ts';
import { createHash, randomUUID } from 'node:crypto';
import { blockText, pageStatus, textBlocks } from '@vocabularium/domain/pages';
import {
  addBlocked, copyModules, deleteBlocked, DECK_COLOURS, generationTargets, moveBlocked, moved, pageMeaning, validateConfiguration
} from '@vocabularium/domain/page-modules';
import { facetAddBlocked, facetDeleteBlocked, isParentType, withFacet } from '@vocabularium/domain/parents';
import { withoutFacet } from '@vocabularium/domain/render';
import { hasFacetContent, parentContentOf, parentDocument, validateParentContent, withFacetEntry } from '@vocabularium/domain/content';
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
  (SELECT k.content FROM components k WHERE k.page_id = b.id AND k.module_type = 'main-key') AS main_key,
  (SELECT CASE WHEN BOOL_OR(q.status = 'failed') THEN 'failed'
    WHEN BOOL_OR(q.status = 'loading') THEN 'loading'
    WHEN COUNT(q.status) > 0 THEN 'completed' ELSE NULL END
    FROM components q WHERE q.page_id = b.id) AS status,
  (SELECT json_agg(json_build_object('type', m.module_type, 'status', m.status,
      'filled', EXISTS (SELECT 1 FROM jsonb_array_elements(m.content::jsonb -> 'blocks') e WHERE e ->> 'type' = 'parent' OR btrim(e ->> 'text') <> ''),
      'content', CASE WHEN m.module_type IN ('main-key', 'context', 'text') THEN NULL ELSE m.content END) ORDER BY m.position)
    FROM components m WHERE m.page_id = b.id) AS modules`;
// A page summary (D05): the list shows the main key, the first meaning, and one
// family mark per module, never the page's full content.
function pageSummary(row) {
  const components = (row.modules ?? []).map(module => ({ ...module, content: module.content ? JSON.parse(module.content) : null }));
  return { id: row.id, deckId: row.deck_id, selectedText: row.selected_text, createdAt: row.created_at,
    mainKey: row.main_key ? blockText(JSON.parse(row.main_key)) : '', status: row.status,
    meaning: pageMeaning(components),
    modules: components.filter(module => module.type !== 'main-key').map(({ type, status, filled }) => ({ type, status, filled })) };
}
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
// A parent component's saved edit (D09): one parent block whose data has the
// parent's shape, only the component's facets, and the core's top line
// (kind, language, key, romanization) as stored; any other field may be empty.
// Plain text may not replace structured content: until the field editor
// (0.7.4, increment 5), a component that holds only text still takes text.
function parentEdit(component, value) {
  const stored = parentContentOf(component.content);
  if (value?.version === 1 && Array.isArray(value.blocks) && value.blocks.length === 1 && value.blocks[0]?.type === 'parent') {
    if (!stored) fail('invalid', 'Generate this module before editing it.');
    let content;
    try { content = validateParentContent(component.moduleType, { core: value.blocks[0].core, facets: value.blocks[0].facets }, { facets: component.facets ?? [] }); }
    catch (error) { fail('invalid', error.message); }
    const header = core => core.kind === 'word' ? [core.kind, core.language, core.key, core.romanization ?? null] : [core.kind];
    if (JSON.stringify(header(content.core)) !== JSON.stringify(header(stored.core))) fail('invalid', "The module's top line can not be changed.");
    return parentDocument(content);
  }
  if (stored) fail('invalid', 'Edit this module through its fields.');
  return blockValue(value, 'Component content must be a text document.');
}
function textValue(value, message) {
  if (typeof value !== 'string') fail('invalid', message);
  return value;
}
// A new account's My Deck (D08): the main key, Context, and German with all its facets.
export const DEFAULT_DECK_MODULES = Object.freeze([{ type: 'main-key' }, { type: 'context' },
  { type: 'german', facets: ['article', 'examples', 'synonyms', 'antonyms'] }]);
// A parent module carries its facets (D08); other modules keep their earlier shape.
const withFacets = (type, facets) => isParentType(type) || facets?.length ? { facets: [...(facets ?? [])] } : {};

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
      for (const [position, module] of types.entries()) {
        const { type, facets = [] } = typeof module === 'string' ? { type: module } : module;
        await this.database.run("INSERT INTO deck_modules (id, deck_id, position, type, facets) VALUES ($1, $2, $3, $4, $5)", [randomUUID(), id, position, type, facets]);
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
      const deck = await this.database.one("SELECT id, name, view, colour FROM decks WHERE id = $1", [id]);
      if (!deck) fail('deleted', 'The deck no longer exists.');
      const modules = await this.database.all("SELECT id, type, facets FROM deck_modules WHERE deck_id = $1 ORDER BY position", [id]);
      return { id: deck.id, name: deck.name, colour: deck.colour,
        modules: modules.map(({ id, type, facets }) => ({ id, type, ...withFacets(type, facets) })), view: { module: deck.view } };
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
        SELECT id, name, colour, ordinal FROM decks WHERE ordinal > $1 ORDER BY ordinal LIMIT $2
      ) SELECT b.id, b.name, b.colour, b.ordinal,
        (SELECT COUNT(*) FROM deck_modules WHERE deck_id = b.id) AS module_count,
        (SELECT COUNT(*) FROM pages WHERE deck_id = b.id) AS page_count
        FROM bounded b ORDER BY b.ordinal`, [after?.key ?? 0, size + 1]);
      const visible = rows.slice(0, size);
      return {
        decks: visible.map(row => ({ id: row.id, name: row.name, colour: row.colour, moduleCount: Number(row.module_count), pageCount: Number(row.page_count) })),
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
  // The configuration is only the template for new pages; saving it never
  // changes an existing page.
  async saveDeck(operationId, { deck }) {
    return await this.command(operationId, 'save-deck', { deck }, async () => {
      if (!deck || typeof deck.name !== 'string' || !deck.name.trim() || !Array.isArray(deck.modules) ||
        deck.modules.some(module => !module || typeof module.id !== 'string' || !module.id || typeof module.type !== 'string')) {
        fail('invalid', 'Give the deck a name and choose supported modules.');
      }
      try { validateConfiguration(deck.modules); } catch (error) { fail('invalid', error.message); }
      if (deck.view !== undefined && deck.view?.module !== 'default') fail('invalid', 'Choose a supported view.');
      if (deck.colour != null && !DECK_COLOURS.includes(deck.colour)) fail('invalid', 'Choose one of the deck colours.');
      const current = deck.id ? (await this.deck(deck.id)) : null;
      const id = current?.id ?? randomUUID();
      for (const module of deck.modules) {
        const saved = await this.database.one("SELECT deck_id FROM deck_modules WHERE id = $1", [module.id]);
        if (saved && saved.deck_id !== id) fail('invalid', 'This module instance belongs to another deck.');
      }
      // A save without a colour keeps the deck's current one.
      const colour = deck.colour === undefined ? (current?.colour ?? null) : deck.colour;
      if (current) await this.database.run("UPDATE decks SET name = $1, colour = $2 WHERE id = $3", [deck.name.trim(), colour, id]);
      else await this.database.run("INSERT INTO decks (id, name, colour) VALUES ($1, $2, $3)", [id, deck.name.trim(), colour]);
      await this.database.run("DELETE FROM deck_modules WHERE deck_id = $1", [id]);
      for (const [position, module] of deck.modules.entries()) {
        await this.database.run("INSERT INTO deck_modules (id, deck_id, position, type, facets) VALUES ($1, $2, $3, $4, $5)",
          [module.id, id, position, module.type, module.facets ?? []]);
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
      // A facet added since the parent's last attempt waits for the next Retry (D08).
      const components = (await this.database.all(`SELECT c.*, a.module AS attempt_module, a.state AS attempt_state FROM components c
        LEFT JOIN component_attempts a ON a.id = c.attempt_id WHERE c.page_id = $1 ORDER BY c.position`, [id]))
        .map(row => {
          const module = row.attempt_module ? JSON.parse(row.attempt_module) : null;
          const generated = module ? module.facets ?? [] : null;
          const waiting = generated && isParentType(row.module_type) ? row.facets.filter(facet => !generated.includes(facet)) : [];
          // A facet's own Retry (0.7.3): the facet it regenerates, or the one whose Retry failed.
          const retry = module?.retry && row.facets?.includes(module.retry) ? module.retry : null;
          return { id: row.id, moduleInstanceId: row.module_instance_id, moduleType: row.module_type,
            ...withFacets(row.module_type, row.facets), ...(isParentType(row.module_type) ? { waitingFacets: waiting } : {}),
            ...(retry && row.status === 'loading' ? { retryingFacet: retry } : {}),
            ...(retry && row.attempt_state === 'failed' ? { failedFacet: retry } : {}),
            content: JSON.parse(row.content), status: row.status, attemptId: row.attempt_id };
        });
      // The latest run's reading of the main key (D08), shown under the page title.
      const latest = await this.database.one(`SELECT interpretation FROM generation_runs
        WHERE page_id = $1 AND interpretation IS NOT NULL ORDER BY ordinal DESC LIMIT 1`, [id]);
      return { id: page.id, deckId: page.deck_id, selectedText: page.selected_text, createdAt: page.created_at,
        components, status: pageStatus(components), interpretation: latest ? JSON.parse(latest.interpretation).inputType : null };
    });
  }
  async pages() {
    return this.database.transaction(async () => {
      const pages = [];
      for (const { id } of await this.database.all('SELECT id FROM pages ORDER BY created_at DESC, id')) pages.push(await this.page(id));
      return pages;
    });
  }
  // Each module instance on a page owns one component; positions follow page order.
  async insertComponent(pageId, { moduleInstanceId, moduleType, facets = [], content }, position) {
    const id = randomUUID();
    await this.database.run(`INSERT INTO components (page_id, id, module_instance_id, module_type, position, content, facets)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`, [pageId, id, moduleInstanceId, moduleType, position, JSON.stringify(content), facets]);
    return id;
  }
  async renumber(pageId, components) {
    for (const [position, component] of components.entries()) {
      await this.database.run("UPDATE components SET position = $1 WHERE page_id = $2 AND id = $3", [position, pageId, component.id]);
    }
  }
  // A new page copies the deck's modules under its own instance IDs. The main
  // key, and the Context and Text values keyed by deck instance, fill input
  // components; content components wait until generated.
  async insertPage(deck, { selectedText, mainKey, values = new Map() }) {
    if (typeof mainKey !== 'string' || !mainKey.trim()) fail('invalid', 'Main key can not be empty.');
    const id = randomUUID();
    await this.database.run("INSERT INTO pages (id, deck_id, selected_text, created_at, main_key_sort_key) VALUES ($1, $2, $3, $4, $5)",
      [id, deck.id, selectedText, new Date().toISOString(), sortKey(mainKey)]);
    const copies = copyModules(deck.modules, randomUUID);
    for (const [position, module] of copies.entries()) {
      const content = module.type === 'main-key' ? textBlocks(mainKey) : values.get(deck.modules[position].id) ?? textBlocks('');
      await this.insertComponent(id, { moduleInstanceId: module.id, moduleType: module.type, facets: module.facets, content }, position);
    }
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
      // Capture follows the deck's current configuration, not the prepared snapshot:
      // Context taken while the deck had the Context module is dropped if it no longer does.
      const contextModule = deck.modules.find(module => module.type === 'context');
      const values = new Map(contextModule && context ? [[contextModule.id, textBlocks(context)]] : []);
      const id = await this.insertPage(deck, { selectedText: mainKey, mainKey, values });
      const { attemptIds } = await this.startRun(id, session, generationTargets({ scope: 'capture' }, (await this.page(id)).components));
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
  async startRun(pageId, session, targets, { facet } = {}) {
    if (!targets.length) return { runId: null, attemptIds: [] };
    const runId = randomUUID();
    // A facet's own Retry (0.7.3) keeps the page's latest reading of the main
    // key, so the facet follows the core it joins.
    const reading = facet ? await this.database.one(`SELECT interpretation FROM generation_runs
      WHERE page_id = $1 AND interpretation IS NOT NULL ORDER BY ordinal DESC LIMIT 1`, [pageId]) : null;
    await this.database.run("INSERT INTO generation_runs (id, page_id, interpretation) VALUES ($1, $2, $3)", [runId, pageId, reading?.interpretation ?? null]);
    const attemptIds = [];
    for (const { id: componentId, moduleInstanceId, moduleType, facets, waitingFacets, status } of targets) {
      const attemptId = randomUUID();
      // An attempt generates the facets its parent has when it starts (D08).
      // A facet's own attempt generates that facet alone: afterwards the
      // content holds what it held before, and that facet. It keeps the
      // content meanwhile, and how to put the component back if it fails.
      const module = facet
        ? { id: moduleInstanceId, type: moduleType, facets: facets.filter(each => each === facet || !waitingFacets?.includes(each)),
          retry: facet, prior: { status, waiting: Boolean(waitingFacets?.includes(facet)) } }
        : { id: moduleInstanceId, type: moduleType, ...withFacets(moduleType, facets) };
      await this.database.run(`INSERT INTO component_attempts
        (id, page_id, component_id, run_id, installation_id, session_id, epoch, module) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [attemptId, pageId, componentId, runId, session.installationId, session.sessionId, session.epoch, JSON.stringify(module)]);
      if (facet) await this.database.run("UPDATE components SET status = 'loading', attempt_id = $1 WHERE page_id = $2 AND id = $3", [attemptId, pageId, componentId]);
      else await this.database.run("UPDATE components SET content = $1, status = 'loading', attempt_id = $2 WHERE page_id = $3 AND id = $4",
        [JSON.stringify(textBlocks('')), attemptId, pageId, componentId]);
      attemptIds.push(attemptId);
    }
    return { runId, attemptIds };
  }
  // A facet's own attempt that fails (0.7.3) leaves the content as it was and
  // the component in its earlier state; a facet that was waiting still waits.
  async keepAfterFacetFailure(attempt) {
    const { retry, prior } = attempt.module;
    await this.database.run("UPDATE components SET status = $2 WHERE attempt_id = $1 AND status = 'loading'", [attempt.id, prior?.status ?? null]);
    const module = prior?.waiting ? { ...attempt.module, facets: (attempt.module.facets ?? []).filter(item => item !== retry) } : attempt.module;
    await this.database.run("UPDATE component_attempts SET state = 'failed', result = NULL, module = $2 WHERE id = $1 AND state = 'loading'", [attempt.id, JSON.stringify(module)]);
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
      const row = await this.database.one("SELECT id, module FROM component_attempts WHERE id = $1", [attemptId]);
      const attempt = row && { ...row, module: JSON.parse(row.module) };
      if (attempt?.module.retry) return this.keepAfterFacetFailure(attempt);
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
      // A generated result is structured content (D09); plain text stays accepted for fixtures until 0.7.4's cards switch.
      if (typeof result.ok !== 'boolean' || (result.ok && typeof result.text !== 'string' && !(result.content && typeof result.content === 'object'))) fail('invalid', 'Invalid component result.');
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
      if (attempt.module.retry && !attempt.result.ok) {
        const component = await this.database.one("SELECT id FROM components WHERE page_id = $1 AND id = $2 AND attempt_id = $3 AND status = 'loading'",
          [attempt.page_id, attempt.component_id, attemptId]);
        if (!component) fail('stale_attempt', 'The component has moved on to another attempt.');
        await this.keepAfterFacetFailure(attempt);
        return { pageId: attempt.page_id, componentId: attempt.component_id, state: 'failed' };
      }
      const state = attempt.result.ok ? 'completed' : 'failed';
      const content = !attempt.result.ok ? textBlocks('')
        : attempt.result.content ? parentDocument(validateParentContent(attempt.module.type, attempt.result.content))
        : textBlocks(attempt.result.text);
      const changed = await this.database.run(`UPDATE components SET content = $1, status = $2
        WHERE page_id = $3 AND id = $4 AND attempt_id = $5 AND status = 'loading'`, [JSON.stringify(content), state, attempt.page_id, attempt.component_id, attemptId]);
      if (!changed.rowCount) fail('stale_attempt', 'The component has moved on to another attempt.');
      await this.database.run("UPDATE component_attempts SET state = $1, result = NULL WHERE id = $2", [state, attemptId]);
      return { pageId: attempt.page_id, componentId: attempt.component_id, state };
    });
  }
  async savePage(operationId, { pageId, changes }) {
    return await this.command(operationId, 'save-page', { pageId, changes }, async () => {
      const page = await this.page(pageId);
      if (!Array.isArray(changes) || changes.some(change => !change || typeof change !== 'object') ||
        new Set(changes.map(change => change.componentId)).size !== changes.length) fail('invalid', 'Choose each changed component once.');
      const updates = [];
      for (const change of changes) {
        const component = page.components.find(component => component.id === change.componentId);
        if (!component) fail('deleted', 'A changed component no longer exists.');
        if (component.status === 'loading') fail('generating', 'A component is still generating. Your drafts are preserved.');
        const content = isParentType(component.moduleType) ? parentEdit(component, change.content) : blockValue(change.content, 'Component content must be a text document.');
        if (component.moduleType === 'main-key' && !blockText(content).trim()) fail('invalid', 'Main key can not be empty.');
        updates.push({ component, content });
      }
      for (const { component, content } of updates) {
        await this.database.run("UPDATE components SET content = $1 WHERE page_id = $2 AND id = $3", [JSON.stringify(content), pageId, component.id]);
        if (component.moduleType === 'main-key') await this.database.run("UPDATE pages SET main_key_sort_key = $1 WHERE id = $2", [sortKey(blockText(content)), pageId]);
      }
      return { pageId };
    });
  }
  // Manual creation copies the deck's modules and never starts generation. The
  // user's Context and Text values are keyed by the deck instance they fill.
  async createPage(operationId, { deckId, mainKey, initial = [] }) {
    return await this.command(operationId, 'create-page', { deckId, mainKey, initial }, async () => {
      const deck = await this.deck(deckId);
      if (!Array.isArray(initial)) fail('invalid', 'Initial content must be a list.');
      const values = new Map();
      for (const item of initial) {
        const module = deck.modules.find(candidate => candidate.id === item?.moduleInstanceId);
        if (!module || !['context', 'text'].includes(module.type) || values.has(module.id)) fail('invalid', 'Only the Context and Text can start with your content.');
        values.set(module.id, blockValue(item.content, 'Components must be text documents.'));
      }
      return { pageId: await this.insertPage(deck, { selectedText: null, mainKey, values }) };
    });
  }
  // Shaping: each step is one ordered operation, applied immediately.
  async addModule(operationId, { pageId, type, position }) {
    return await this.command(operationId, 'add-module', { pageId, type, position }, async () => {
      const page = await this.page(pageId);
      const blocked = addBlocked(page.components.map(component => ({ type: component.moduleType })), type);
      if (blocked) fail('invalid', blocked);
      const at = position ?? page.components.length;
      if (!Number.isInteger(at) || at < 1 || at > page.components.length) fail('invalid', 'Choose a position below the main key.');
      const componentId = await this.insertComponent(pageId, { moduleInstanceId: randomUUID(), moduleType: type, content: textBlocks('') }, page.components.length);
      await this.renumber(pageId, moved([...page.components, { id: componentId }], componentId, at));
      return { pageId, componentId };
    });
  }
  // Facets (D08) join or leave one parent component, immediately. A facet lands
  // only on a parent of its own type; an added one waits for the next Retry.
  async addFacet(operationId, { pageId, componentId, parent, facet }) {
    return await this.command(operationId, 'add-facet', { pageId, componentId, parent, facet }, async () => {
      const page = await this.page(pageId);
      const component = page.components.find(item => item.id === componentId);
      const blocked = facetAddBlocked(component && { id: component.id, type: component.moduleType, facets: component.facets, status: component.status }, parent, facet);
      if (blocked) fail(component ? 'invalid' : 'deleted', blocked);
      await this.database.run("UPDATE components SET facets = $1 WHERE page_id = $2 AND id = $3",
        [withFacet(parent, component.facets ?? [], facet), pageId, componentId]);
      return { pageId, componentId };
    });
  }
  // Deleting a facet removes its section from the content and the facet from the
  // instance, so a later Retry does not bring it back.
  async deleteFacet(operationId, { pageId, componentId, parent, facet }) {
    return await this.command(operationId, 'delete-facet', { pageId, componentId, parent, facet }, async () => {
      const page = await this.page(pageId);
      const component = page.components.find(item => item.id === componentId);
      const holder = component && { id: component.id, type: component.moduleType, facets: component.facets, status: component.status };
      const blocked = component && component.moduleType !== parent ? 'This facet is no longer there.' : facetDeleteBlocked(holder, facet);
      if (blocked) fail(component ? 'invalid' : 'deleted', blocked);
      // Structured content (D09) loses the facet's entry; plain text, its section.
      const data = parentContentOf(component.content);
      const content = data ? parentDocument(withFacetEntry(data, facet, undefined)) : textBlocks(withoutFacet(parent, blockText(component.content), facet));
      await this.database.run("UPDATE components SET facets = $1, content = $2 WHERE page_id = $3 AND id = $4",
        [component.facets.filter(item => item !== facet), JSON.stringify(content), pageId, componentId]);
      // Its section is gone from the content, so the last attempt no longer counts
      // as having generated it: added again, it waits for the next Retry.
      if (component.attemptId) {
        const attempt = await this.attempt(component.attemptId);
        const module = { ...attempt.module, facets: (attempt.module.facets ?? []).filter(item => item !== facet) };
        await this.database.run("UPDATE component_attempts SET module = $1 WHERE id = $2", [JSON.stringify(module), component.attemptId]);
      }
      return { pageId, componentId };
    });
  }
  // Deleting removes the module instance from the page: generation never brings it back.
  async deleteComponent(operationId, { pageId, componentId }) {
    return await this.command(operationId, 'delete-component', { pageId, componentId }, async () => {
      const page = await this.page(pageId);
      const blocked = deleteBlocked(page.components, componentId);
      if (blocked) fail(page.components.some(component => component.id === componentId) ? 'invalid' : 'deleted', blocked);
      await this.database.run("DELETE FROM components WHERE page_id = $1 AND id = $2", [pageId, componentId]);
      await this.renumber(pageId, page.components.filter(component => component.id !== componentId));
      return { pageId, componentId };
    });
  }
  async moveComponent(operationId, { pageId, componentId, position }) {
    return await this.command(operationId, 'move-component', { pageId, componentId, position }, async () => {
      const page = await this.page(pageId);
      const blocked = moveBlocked(page.components, componentId, position);
      if (blocked) fail(page.components.some(component => component.id === componentId) ? 'invalid' : 'deleted', blocked);
      await this.renumber(pageId, moved(page.components, componentId, position));
      return { pageId, componentId };
    });
  }
  // The content a confirmed retry replaces. The client shows it, then echoes the digest.
  confirmationDigest(targets) {
    return digest(targets.map(component => ({ moduleInstanceId: component.moduleInstanceId, content: component.content })));
  }
  async generate(operationId, { pageId, target, session, confirmation }, { admit } = {}) {
    return await this.command(operationId, 'generate', { pageId, target, session, confirmation }, async () => {
      await this.requireSession(session);
      const page = await this.page(pageId);
      if (!target || !['missing', 'page', 'component', 'facet'].includes(target.scope)) fail('invalid', 'Choose what to generate.');
      let targets;
      try { targets = generationTargets(target, page.components); }
      catch (error) { fail('invalid', error.message); }
      if (targets.some(component => component.status === 'loading')) fail('generating', 'A component is already generating.');
      // Replacing content needs confirmation. A component with nothing in it has
      // nothing to replace, whether it never generated, failed, or generated
      // nothing (0.6.3; until then any earlier attempt needed confirmation).
      // A facet's own Retry (0.7.3) replaces only its section.
      const facet = target.scope === 'facet' ? target.facet : null;
      // Structured content (D09) is compared as data: a facet's entry, or the whole content.
      const replaced = component => {
        const data = parentContentOf(component.content);
        if (facet) return data && hasFacetContent(data, facet) ? data.facets[facet] : null;
        return data ?? (blockText(component.content) || null);
      };
      const replaces = targets.some(replaced);
      if (target.scope !== 'missing' && replaces) {
        const expected = facet ? digest(targets.map(component => ({ moduleInstanceId: component.moduleInstanceId, facet, content: replaced(component) })))
          : this.confirmationDigest(targets);
        if (confirmation !== expected) {
          throw new StoreError('confirmation_required', 'Retry replaces this content, including your edits.', { confirmation: expected });
        }
      }
      admit?.(targets.length);
      return { pageId, attemptIds: (await this.startRun(pageId, session, targets, { facet })).attemptIds };
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
