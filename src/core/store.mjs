// @ts-check
import { Postgres, OWNER_ACCOUNT_ID } from '../persistence/postgres.ts';
import { createHash, randomUUID } from 'node:crypto';
import { blockText, mainKeyOf, noteDocument, pageStatus, textBlocks } from '@vocabularium/domain/pages';
import {
  addBlocked, copyModules, deleteBlocked, DECK_COLOURS, generationTargets, moveBlocked, moved, pageMeaning, validateConfiguration
} from '@vocabularium/domain/page-modules';
import { DEFAULT_DECK_MODULES, facetAddBlocked, facetDeleteBlocked, isParentType, withFacet } from '@vocabularium/domain/parents';
import { ruledOutOf } from '@vocabularium/domain/render';
import { blankContent, hasFacetContent, isEmptyContent, parentContentOf, parentDocument, providerCore, validateParentContent, withFacetText } from '@vocabularium/domain/content';
import { hasText } from '@vocabularium/domain/markdown';
import { sortKey } from './sort-key.mjs';
import { INTERFACE_LANGUAGES } from '@vocabularium/contracts';
/** @import { BlockDocument, BrowserSession, CapturePreparationRequest, Component, ComponentDeleteRequest, ComponentMoveRequest, DeckConfiguration, DeckDeleteRequest, FacetChangePayload, ModuleAddRequest, ModuleInstance, Page, PageCaptureRequest, PageCreateRequest, PageGenerateRequest, PageSaveRequest, ParentHeader, PublishRequest } from '@vocabularium/contracts' */
/** @import { ParentContent } from '@vocabularium/domain/content' */
/** @import { FacetType, ParentType } from '@vocabularium/domain/parents' */
/** @import { AccountRow, Attempt, AttemptModule, AttemptResult, AttemptRow, ClipKey, ClipRow, ComponentRow, DeckModuleRow, DeckRow, GenerationEntry, GenerationRecord, InstallationRow, PageRow, PageSummaryRow, ReceiptRow } from './store-records.js' */
/** @typedef {Readonly<{ v: 1; kind: string; sequence: number; key: string | number; id: string }>} Cursor */
// The generation record after a published attempt (D11): per part with
// content, the model and prompt version that produced it. A whole attempt
// records the core and each facet it produced; a facet's own Retry only that
// facet, the others keeping theirs. A result without a record leaves none.
// The core a card's Retry starts from (D19): the core the card has saved, the
// user's edits included, without its blank fields, or nothing when it has none.
// A core written for another main key has no reading of this one (0.13.2): once
// the user changes the main key, the card generates as on its first attempt.
const sameKey = (/** @type {string} */ a, /** @type {string} */ b) => a.trim().normalize('NFC') === b.trim().normalize('NFC');
/** @param {string} moduleType @param {Component['content']} content @param {string} mainKey @returns {{ previous?: Record<string, unknown> }} */
function previousOf(moduleType, content, mainKey) {
  const data = isParentType(moduleType) ? parentContentOf(content) : null;
  // A Pronunciation card has no text of its own: its reading is its language (D24).
  const read = data && (hasText(data.core) || (data.header.kind === 'pronunciation' && Boolean(data.header.language)));
  if (!data || !read || !sameKey(data.header.key, mainKey)) return {};
  const core = Object.entries(providerCore(/** @type {ParentType} */ (moduleType), data))
    .filter(([, value]) => Array.isArray(value) ? value.some(hasText) : typeof value !== 'string' || hasText(value));
  return core.length ? { previous: Object.fromEntries(core) } : {};
}
/** @param {GenerationRecord | null} previous @param {AttemptModule} module @param {ParentContent} content @param {GenerationEntry | undefined} made @returns {GenerationRecord | null} */
function generationAfter(previous, module, content, made) {
  const entry = made?.prompt ? { model: made.model ?? null, prompt: made.prompt } : null;
  if (!module.retry) return entry ? Object.fromEntries(['core', ...Object.keys(content.facets)].map(part => [part, entry])) : null;
  const record = { ...(previous ?? {}) };
  if (entry && hasFacetContent(content, module.retry)) record[module.retry] = entry;
  else delete record[module.retry];
  return Object.keys(record).length ? record : null;
}

export class StoreError extends Error {
  /** @param {string} code @param {string} message @param {Record<string, unknown>} [details] */
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
/** @type {(code: string, message: string) => never} */
const fail = (code, message) => { throw new StoreError(code, message); };
const encodeCursor = (/** @type {Cursor} */ value) => Buffer.from(JSON.stringify(value)).toString('base64url');
/** @param {unknown} value @param {string} kind @param {number} sequence @returns {Cursor | null} */
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
/** @param {unknown} value @param {number} fallback @param {number} maximum */
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
/** @param {PageSummaryRow} row */
function pageSummary(row) {
  const components = (row.modules ?? []).map(module => ({ ...module, content: module.content ? JSON.parse(module.content) : null }));
  return { id: row.id, deckId: row.deck_id, selectedText: row.selected_text, createdAt: row.created_at,
    mainKey: row.main_key ? blockText(JSON.parse(row.main_key)) : '', status: row.status,
    meaning: pageMeaning(components),
    modules: components.filter(module => module.type !== 'main-key').map(({ type, status, filled }) => ({ type, status, filled })) };
}
/** @param {unknown} value @returns {unknown} */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(/** @type {Record<string, unknown>} */ (value)[key])]));
  }
  return value;
}
const digest = (/** @type {unknown} */ value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
// The value is unchecked input; this is its check.
/** @param {any} value @param {string} message @returns {BlockDocument} */
function blockValue(value, message) {
  if (!value || value.version !== 1 || !Array.isArray(value.blocks) ||
    value.blocks.some((/** @type {any} */ block) => !block || block.type !== 'paragraph' || typeof block.text !== 'string')) fail('invalid', message);
  return { version: 1, blocks: value.blocks.map((/** @type {any} */ block) => ({ type: 'paragraph', text: block.text })) };
}
// A parent component's saved edit (D09, amended): one parent block with the
// core's top line as stored, the core's markdown and markdown for the
// component's facets only; any text may be empty. A parent is never saved as
// plain text, and one that never generated has no top line to edit.
// With a facet (D10), only that facet's text is taken, over the stored
// content, so an edit of the rest elsewhere meanwhile stays.
/** @param {Component} component @param {any} value unchecked input @param {string | undefined} facet @param {Page} page */
function parentEdit(component, value, facet, page) {
  // An empty parent written by hand (D10, amended a fourth time) starts from
  // the blank top line of the page's main key; nothing else can start one.
  const stored = parentContentOf(component.content) ?? (facet === undefined && page ? blankContent(mainKeyOf(page.components), /** @type {ParentType} */ (component.moduleType)) : null);
  if (!(value?.version === 1 && Array.isArray(value.blocks) && value.blocks.length === 1 && value.blocks[0]?.type === 'parent')) {
    fail('invalid', 'Edit this module in its editor.');
  }
  if (!stored) fail('invalid', 'Generate this module before editing it.');
  const { type, ...block } = value.blocks[0];
  if (facet !== undefined && !(component.facets ?? []).includes(facet)) fail('invalid', 'This facet is no longer there.');
  let content;
  try {
    content = validateParentContent(/** @type {ParentType} */ (component.moduleType), block, { facets: component.facets ?? [] });
    if (facet !== undefined) content = validateParentContent(/** @type {ParentType} */ (component.moduleType), withFacetText(stored, /** @type {FacetType} */ (facet), content.facets[/** @type {FacetType} */ (facet)]), { facets: component.facets ?? [] });
  } catch (error) { fail('invalid', /** @type {Error} */ (error).message); }
  // The top line, with its flags (D17), is never edited.
  const line = (/** @type {ParentHeader} */ header) => JSON.stringify(Object.entries(header).sort(([a], [b]) => a < b ? -1 : 1));
  if (line(content.header) !== line(stored.header)) fail('invalid', "The module's top line can not be changed.");
  return parentDocument(content);
}
/** @param {unknown} value @param {string} message */
function textValue(value, message) {
  if (typeof value !== 'string') fail('invalid', message);
  return value;
}
// A new account's My Deck, from the catalog (D08).
export { DEFAULT_DECK_MODULES };
// A parent module carries its facets (D08); other modules keep their earlier shape.
/** @type {(type: string, facets?: readonly string[] | null) => { facets?: string[] }} */
const withFacets = (type, facets) => isParentType(type) || facets?.length ? { facets: [...(facets ?? [])] } : {};

// Account mutations are admitted synchronously and commit before acknowledgment.
// Provider work never runs inside the ordered executor or database transaction.
export class AccountStore {
  /** @param {Postgres} database @param {{ outbox?: string | null }} [options] */
  constructor(database, { outbox = null } = {}) {
    this.database = database;
    this.accountId = database.accountId;
    this.outbox = outbox;
  }
  /** @param {{ databaseUrl?: string, accountId?: number, outbox?: string | null, diagnostic?: (event: Record<string, unknown>) => void }} [options] */
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
  /** @template T @param {() => Promise<T>} action */
  ordered(action) { return this.database.ordered.run(action); }
  /** @template T @param {() => T} action */
  background(action) { return this.database.detached(action); }
  loadingAttempts() {
    return this.database.transaction(() => /** @type {Promise<Pick<AttemptRow, 'id' | 'page_id' | 'run_id' | 'session_id' | 'result'>[]>} */ (this.database.all("SELECT id, page_id, run_id, session_id, result FROM component_attempts WHERE state = 'loading'")));
  }
  /** @param {string} name @param {readonly (string | Readonly<{ type: string, facets?: readonly string[] }>)[]} [types] */
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
  /** @template {object} T @param {string} operationId @param {string} kind @param {unknown} payload @param {() => Promise<T>} action @returns {Promise<T & { sequence: number, replayed: boolean }>} */
  async command(operationId, kind, payload, action) {
    if (typeof operationId !== 'string' || !operationId) fail('invalid', 'An operation ID is required.');
    const fingerprint = digest([kind, payload]);
    return this.database.transaction(async () => {
      const receipt = /** @type {ReceiptRow | undefined} */ (await this.database.one('SELECT * FROM receipts WHERE operation_id = $1', [operationId]));
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) fail('operation_reused', 'Operation ID belongs to another change.');
        return { ...JSON.parse(receipt.result), sequence: Number(receipt.sequence), replayed: true };
      }
      const result = await action();
      const receiptRow = /** @type {Pick<ReceiptRow, 'sequence'>} */ (await this.database.one('INSERT INTO receipts (operation_id, fingerprint, result) VALUES ($1, $2, $3) RETURNING sequence', [operationId, fingerprint, JSON.stringify(result)]));
      return { ...result, sequence: Number(receiptRow.sequence), replayed: false };
    });
  }
  /** @param {string} operationId @param {BrowserSession} session */
  async openSession(operationId, session) {
    return await this.command(operationId, 'open-session', session, async () => {
      const { installationId, epoch, sessionId } = session;
      if (!installationId || !sessionId || !Number.isSafeInteger(epoch) || epoch < 1) {
        fail('invalid', 'A valid installation and browser session are required.');
      }
      const previous = /** @type {InstallationRow | undefined} */ (await this.database.one("SELECT * FROM installations WHERE id = $1", [installationId]));
      if (previous && (previous.epoch > epoch || (previous.epoch === epoch && previous.session_id !== sessionId))) {
        fail('stale_session', 'This browser session has ended.');
      }
      if (previous && previous.session_id !== sessionId) {
        await this.database.run(`UPDATE components SET content = $2, status = 'failed', generation = NULL WHERE attempt_id IN
          (SELECT id FROM component_attempts WHERE installation_id = $1 AND state = 'loading')`, [installationId, JSON.stringify(textBlocks(''))]);
        await this.database.run(`UPDATE component_attempts SET state = 'failed', result = NULL
          WHERE installation_id = $1 AND state = 'loading'`, [installationId]);
      }
      await this.database.run(`INSERT INTO installations VALUES ($1, $2, $3)
        ON CONFLICT(id) DO UPDATE SET epoch = excluded.epoch, session_id = excluded.session_id`, [installationId, epoch, sessionId]);
      return { session };
    });
  }
  /** @param {BrowserSession} session */
  async requireSession(session) {
    return this.database.transaction(async () => {
      const current = /** @type {InstallationRow | undefined} */ (await this.database.one("SELECT * FROM installations WHERE id = $1", [session.installationId]));
      if (!current || current.epoch !== session.epoch || current.session_id !== session.sessionId) {
        fail('stale_session', 'This browser session has ended.');
      }
    });
  }
  /** @param {string} id */
  async deck(id) {
    return this.database.transaction(async () => {
      const deck = /** @type {Pick<DeckRow, 'id' | 'name' | 'view' | 'colour'> | undefined} */ (await this.database.one("SELECT id, name, view, colour FROM decks WHERE id = $1", [id]));
      if (!deck) fail('deleted', 'The deck no longer exists.');
      const modules = /** @type {Pick<DeckModuleRow, 'id' | 'type' | 'facets'>[]} */ (await this.database.all("SELECT id, type, facets FROM deck_modules WHERE deck_id = $1 ORDER BY position", [id]));
      return { id: deck.id, name: deck.name, colour: deck.colour,
        modules: modules.map(({ id, type, facets }) => ({ id, type, ...withFacets(type, facets) })), view: { module: deck.view } };
    });
  }
  async snapshot() {
    return this.database.transaction(async () => {
      const { default_deck_id: id } = /** @type {AccountRow} */ (await this.database.one("SELECT * FROM account", []));
      const { modules } = await this.deck(id);
      return { id, modules };
    });
  }
  async account() {
    return this.database.transaction(async () => {
      const { default_deck_id: defaultDeckId, language } = /** @type {AccountRow} */ (await this.database.one("SELECT * FROM account", []));
      const decks = [];
      for (const { id } of /** @type {Pick<DeckRow, 'id'>[]} */ (await this.database.all('SELECT id FROM decks ORDER BY ordinal'))) decks.push(await this.deck(id));
      return { defaultDeckId, language, decks, pages: (await this.pages()), sequence: await this.readSequence() };
    });
  }
  async readSequence() {
    const { sequence } = /** @type {Pick<ReceiptRow, 'sequence'>} */ (await this.database.one('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM receipts'));
    return Number(sequence);
  }
  /** @param {{ cursor?: string, limit?: number }} [options] */
  async listDecks({ cursor, limit } = {}) {
    return this.database.transaction(async () => {
      const size = pageLimit(limit, 40, 50);
      const sequence = await this.readSequence();
      const after = decodeCursor(cursor, 'decks', sequence);
      if (after && (!Number.isSafeInteger(after.key) || /** @type {number} */ (after.key) < 0)) fail('invalid', 'The list cursor is invalid.');
      const rows = /** @type {(Pick<DeckRow, 'id' | 'name' | 'colour' | 'ordinal'> & { module_count: number, page_count: number })[]} */ (await this.database.all(`WITH bounded AS MATERIALIZED (
        SELECT id, name, colour, ordinal FROM decks WHERE ordinal > $1 ORDER BY ordinal LIMIT $2
      ) SELECT b.id, b.name, b.colour, b.ordinal,
        (SELECT COUNT(*) FROM deck_modules WHERE deck_id = b.id) AS module_count,
        (SELECT COUNT(*) FROM pages WHERE deck_id = b.id) AS page_count
        FROM bounded b ORDER BY b.ordinal`, [after?.key ?? 0, size + 1]));
      const visible = rows.slice(0, size);
      return {
        decks: visible.map(row => ({ id: row.id, name: row.name, colour: row.colour, moduleCount: Number(row.module_count), pageCount: Number(row.page_count) })),
        nextCursor: rows.length > size ? encodeCursor({ v: 1, kind: 'decks', sequence, key: /** @type {Pick<DeckRow, 'id' | 'ordinal'>} */ (visible.at(-1)).ordinal, id: /** @type {Pick<DeckRow, 'id' | 'ordinal'>} */ (visible.at(-1)).id }) : null,
        sequence
      };
    });
  }
  async summary() {
    return this.database.transaction(async () => {
      const { default_deck_id: defaultDeckId, language } = /** @type {AccountRow} */ (await this.database.one('SELECT default_deck_id, language FROM account WHERE id = $1', [this.accountId]));
      const listed = await this.listDecks();
      return { defaultDeckId, language, defaultDeckSnapshot: await this.deck(defaultDeckId), ...listed };
    });
  }
  /** @param {string} deckId @param {{ order?: string, cursor?: string, limit?: number }} [options] */
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
      /** @type {unknown[]} */
      const values = [deckId];
      let afterClause = '';
      if (after) {
        values.push(alphabetic ? Buffer.from(/** @type {string} */ (after.key), 'base64url') : after.key, after.id);
        afterClause = `AND (${column} ${direction === 'ASC' ? '>' : '<'} $2 OR
          (${column} = $2 AND c.id COLLATE "C" > $3 COLLATE "C"))`;
      }
      values.push(size + 1);
      const outerColumn = alphabetic ? 'b.main_key_sort_key' : 'b.created_at COLLATE "C"';
      const rows = /** @type {PageSummaryRow[]} */ (await this.database.all(`WITH bounded AS MATERIALIZED (
        SELECT c.id, c.deck_id, c.selected_text, c.created_at, c.main_key_sort_key
        FROM pages c WHERE c.deck_id = $1 ${afterClause}
        ORDER BY ${column} ${direction}, c.id COLLATE "C" ASC LIMIT $${values.length}
      ) SELECT ${summaryFields} FROM bounded b
        ORDER BY ${outerColumn} ${direction}, b.id COLLATE "C" ASC`, values));
      const visible = rows.slice(0, size);
      // Read only when the batch is full.
      const last = /** @type {PageSummaryRow} */ (visible.at(-1));
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
      const rows = /** @type {PageSummaryRow[]} */ (await this.database.all(`WITH bounded AS MATERIALIZED (
        SELECT c.id, c.deck_id, c.selected_text, c.created_at, c.main_key_sort_key
        FROM pages c WHERE c.selected_text IS NOT NULL
        ORDER BY c.created_at COLLATE "C" DESC, c.id COLLATE "C" ASC LIMIT 20
      ) SELECT ${summaryFields} FROM bounded b
        ORDER BY b.created_at COLLATE "C" DESC, b.id COLLATE "C" ASC`));
      return { pages: rows.map(pageSummary), sequence: await this.readSequence() };
    });
  }
  /** @param {string} operationId @param {string} deckId */
  async setDefault(operationId, deckId) {
    return await this.command(operationId, 'set-default', { deckId }, async () => {
      await this.deck(deckId);
      await this.database.run("UPDATE account SET default_deck_id = $1 WHERE id = 1", [deckId]);
      return { defaultDeckId: deckId };
    });
  }
  // The account's interface language (D14).
  async language() {
    return this.database.transaction(async () =>
      /** @type {Pick<AccountRow, 'language'>} */ (await this.database.one('SELECT language FROM account WHERE id = $1', [this.accountId])).language);
  }
  /** @param {string} operationId @param {unknown} language */
  async setLanguage(operationId, language) {
    return await this.command(operationId, 'set-language', { language }, async () => {
      if (!INTERFACE_LANGUAGES.includes(/** @type {any} */ (language))) fail('invalid', 'Choose a supported language.');
      await this.database.run('UPDATE account SET language = $1 WHERE id = 1', [language]);
      return { language };
    });
  }
  // The configuration is only the template for new pages; saving it never
  // changes an existing page.
  /** @param {string} operationId @param {{ deck?: DeckConfiguration }} payload */
  async saveDeck(operationId, { deck }) {
    return await this.command(operationId, 'save-deck', { deck }, async () => {
      if (!deck || typeof deck.name !== 'string' || !deck.name.trim() || !Array.isArray(deck.modules) ||
        deck.modules.some(module => !module || typeof module.id !== 'string' || !module.id || typeof module.type !== 'string')) {
        fail('invalid', 'Give the deck a name and choose supported modules.');
      }
      try { validateConfiguration(deck.modules); } catch (error) { fail('invalid', /** @type {Error} */ (error).message); }
      if (deck.view !== undefined && deck.view?.module !== 'default') fail('invalid', 'Choose a supported view.');
      if (deck.colour != null && !DECK_COLOURS.includes(deck.colour)) fail('invalid', 'Choose one of the deck colours.');
      const current = deck.id ? (await this.deck(deck.id)) : null;
      const id = current?.id ?? randomUUID();
      for (const module of deck.modules) {
        const saved = /** @type {Pick<DeckModuleRow, 'deck_id'> | undefined} */ (await this.database.one("SELECT deck_id FROM deck_modules WHERE id = $1", [module.id]));
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
  /** @param {string} operationId @param {DeckDeleteRequest['payload']} payload */
  async deleteDeck(operationId, { deckId, replacementId }) {
    return await this.command(operationId, 'delete-deck', { deckId, replacementId }, async () => {
      await this.deck(deckId);
      const { default_deck_id: defaultId } = /** @type {AccountRow} */ (await this.database.one("SELECT * FROM account", []));
      const other = /** @type {Pick<DeckRow, 'id'>[]} */ (await this.database.all("SELECT id FROM decks WHERE id != $1 ORDER BY ordinal", [deckId]));
      let nextDefault = defaultId;
      if (defaultId === deckId) {
        if (!other.length) nextDefault = (await this.createDeck('My Deck')).id;
        else {
          if (!other.some(deck => deck.id === replacementId)) fail('replacement', 'Choose another deck as the default.');
          nextDefault = /** @type {string} */ (replacementId);
        }
        await this.database.run("UPDATE account SET default_deck_id = $1 WHERE id = 1", [nextDefault]);
      }
      await this.database.run("DELETE FROM decks WHERE id = $1", [deckId]);
      return { deckId, defaultDeckId: nextDefault };
    });
  }
  /** @param {string} id @returns {Promise<Page>} */
  async page(id) {
    return this.database.transaction(async () => {
      const page = /** @type {PageRow | undefined} */ (await this.database.one("SELECT * FROM pages WHERE id = $1", [id]));
      if (!page) fail('deleted', 'The page no longer exists.');
      // A facet added since the parent's last attempt waits for the next Retry (D08).
      const components = (/** @type {(ComponentRow & { attempt_module: string | null, attempt_state: AttemptRow['state'] | null })[]} */ (await this.database.all(`SELECT c.*, a.module AS attempt_module, a.state AS attempt_state FROM components c
        LEFT JOIN component_attempts a ON a.id = c.attempt_id WHERE c.page_id = $1 ORDER BY c.position`, [id])))
        .map(row => {
          const module = /** @type {AttemptModule | null} */ (row.attempt_module ? JSON.parse(row.attempt_module) : null);
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
      return { id: page.id, deckId: page.deck_id, selectedText: page.selected_text, createdAt: page.created_at,
        components, status: pageStatus(components) };
    });
  }
  async pages() {
    return this.database.transaction(async () => {
      const pages = [];
      for (const { id } of /** @type {Pick<PageRow, 'id'>[]} */ (await this.database.all('SELECT id FROM pages ORDER BY created_at DESC, id'))) pages.push(await this.page(id));
      return pages;
    });
  }
  // Each module instance on a page owns one component; positions follow page order.
  /** @param {string} pageId @param {{ moduleInstanceId: string, moduleType: string, facets?: readonly string[], content: BlockDocument }} component @param {number} position */
  async insertComponent(pageId, { moduleInstanceId, moduleType, facets = [], content }, position) {
    const id = randomUUID();
    await this.database.run(`INSERT INTO components (page_id, id, module_instance_id, module_type, position, content, facets)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`, [pageId, id, moduleInstanceId, moduleType, position, JSON.stringify(content), facets]);
    return id;
  }
  /** @param {string} pageId @param {readonly { id: string }[]} components */
  async renumber(pageId, components) {
    for (const [position, component] of components.entries()) {
      await this.database.run("UPDATE components SET position = $1 WHERE page_id = $2 AND id = $3", [position, pageId, component.id]);
    }
  }
  // A new page copies the deck's modules under its own instance IDs. The main
  // key, and the Context and Text values keyed by deck instance, fill input
  // components; content components wait until generated.
  /** @param {{ id: string, modules: readonly ModuleInstance[] }} deck @param {{ selectedText: string | null, mainKey: string, values?: Map<string, BlockDocument> }} page */
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
  /** @param {string} operationId @param {PageCaptureRequest['payload']} payload @param {{ recoverySession?: BrowserSession }} [options] */
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
      // Context is markdown (D10, amended a fourth time): stored escaped, the main key highlighted.
      const values = new Map(contextModule && context ? [[contextModule.id, noteDocument(context, mainKey)]] : []);
      const id = await this.insertPage(deck, { selectedText: mainKey, mainKey, values });
      const { attemptIds } = await this.startRun(id, session, generationTargets({ scope: 'capture' }, (await this.page(id)).components));
      if (interrupted) for (const attemptId of attemptIds) await this.failAttempt(attemptId);
      return { pageId: id, interrupted: Boolean(interrupted) };
    });
  }
  /** @param {string} operationId @param {CapturePreparationRequest['payload']} payload */
  async prepareCapture(operationId, { session, mainKey }) {
    return await this.command(operationId, 'prepare-capture', { session, mainKey }, async () => {
      await this.requireSession(session);
      if (typeof mainKey !== 'string' || !mainKey.length) fail('invalid', 'Select some text first.');
      return { snapshot: (await this.snapshot()) };
    });
  }
  // One run per request. Since D17 its attempts share no reading of the main
  // key: each module reads it in its own request.
  /** @param {string} pageId @param {BrowserSession} session @param {readonly Component[]} targets @param {{ facet?: string | null, mainKey?: string }} [options] */
  async startRun(pageId, session, targets, { facet, mainKey = '' } = {}) {
    if (!targets.length) return { runId: null, attemptIds: [] };
    const runId = randomUUID();
    await this.database.run("INSERT INTO generation_runs (id, page_id) VALUES ($1, $2)", [runId, pageId]);
    const attemptIds = [];
    for (const { id: componentId, moduleInstanceId, moduleType, facets, waitingFacets, status, content } of targets) {
      const attemptId = randomUUID();
      // An attempt generates the facets its parent has when it starts (D08).
      // A facet's own attempt generates that facet alone: afterwards the
      // content holds what it held before, and that facet. It keeps the
      // content meanwhile, and how to put the component back if it fails.
      const module = facet
        // A facet's own Retry targets a parent component, which has its facets.
        ? { id: moduleInstanceId, type: moduleType, facets: /** @type {string[]} */ (facets).filter(each => each === facet || !waitingFacets?.includes(each)),
          retry: facet, prior: { status, waiting: Boolean(waitingFacets?.includes(facet)) } }
        // A card's Retry keeps the reading of the core it had, as saved (D19).
        : { id: moduleInstanceId, type: moduleType, ...withFacets(moduleType, facets), ...previousOf(moduleType, content, mainKey) };
      await this.database.run(`INSERT INTO component_attempts
        (id, page_id, component_id, run_id, installation_id, session_id, epoch, module) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [attemptId, pageId, componentId, runId, session.installationId, session.sessionId, session.epoch, JSON.stringify(module)]);
      if (facet) await this.database.run("UPDATE components SET status = 'loading', attempt_id = $1 WHERE page_id = $2 AND id = $3", [attemptId, pageId, componentId]);
      else await this.database.run("UPDATE components SET content = $1, status = 'loading', attempt_id = $2, generation = NULL WHERE page_id = $3 AND id = $4",
        [JSON.stringify(textBlocks('')), attemptId, pageId, componentId]);
      attemptIds.push(attemptId);
    }
    return { runId, attemptIds };
  }
  // A facet's own attempt that fails (0.7.3) leaves the content as it was and
  // the component in its earlier state; a facet that was waiting still waits.
  /** @param {Pick<Attempt, 'id' | 'module'>} attempt */
  async keepAfterFacetFailure(attempt) {
    const { retry, prior } = attempt.module;
    await this.database.run("UPDATE components SET status = $2 WHERE attempt_id = $1 AND status = 'loading'", [attempt.id, prior?.status ?? null]);
    const module = prior?.waiting ? { ...attempt.module, facets: (attempt.module.facets ?? []).filter(item => item !== retry) } : attempt.module;
    await this.database.run("UPDATE component_attempts SET state = 'failed', result = NULL, module = $2 WHERE id = $1 AND state = 'loading'", [attempt.id, JSON.stringify(module)]);
  }
  /** @param {string} id @returns {Promise<Attempt>} */
  async attempt(id) {
    return this.database.transaction(async () => {
      const attempt = /** @type {AttemptRow | undefined} */ (await this.database.one("SELECT * FROM component_attempts WHERE id = $1", [id]));
      if (!attempt) fail('deleted', 'The attempt no longer exists.');
      return { ...attempt, module: JSON.parse(attempt.module), result: attempt.result && JSON.parse(attempt.result) };
    });
  }
  // Each component's generation record (D11), by component ID; the interface does not show it.
  /** @param {string} pageId @returns {Promise<Record<string, GenerationRecord>>} */
  async generationRecords(pageId) {
    return this.database.transaction(async () => {
      const rows = /** @type {{ id: string, generation: string }[]} */ (await this.database.all('SELECT id, generation FROM components WHERE page_id = $1 AND generation IS NOT NULL', [pageId]));
      return Object.fromEntries(rows.map(row => [row.id, JSON.parse(row.generation)]));
    });
  }
  /** @param {string} attemptId */
  async failAttempt(attemptId) {
    return this.database.transaction(async () => {
      const row = /** @type {Pick<AttemptRow, 'id' | 'module'> | undefined} */ (await this.database.one("SELECT id, module FROM component_attempts WHERE id = $1", [attemptId]));
      const attempt = row && { ...row, module: /** @type {AttemptModule} */ (JSON.parse(row.module)) };
      if (attempt?.module.retry) return this.keepAfterFacetFailure(attempt);
      await this.database.run("UPDATE components SET content = $2, status = 'failed', generation = NULL WHERE attempt_id = $1 AND status = 'loading'", [attemptId, JSON.stringify(textBlocks(''))]);
      await this.database.run("UPDATE component_attempts SET state = 'failed', result = NULL WHERE id = $1 AND state = 'loading'", [attemptId]);
    });
  }
  /** @param {BrowserSession} session */
  async pendingAttempts(session) {
    return this.database.transaction(async () => {
      await this.requireSession(session);
      const attempts = [];
      for (const { id } of /** @type {Pick<AttemptRow, 'id'>[]} */ (await this.database.all("SELECT id FROM component_attempts WHERE installation_id = $1 AND session_id = $2 AND state = 'loading'", [session.installationId, session.sessionId]))) attempts.push(await this.attempt(id));
      return attempts;
    });
  }
  // Provider completion only stages a result. It cannot publish component content.
  /** @param {string} attemptId @param {AttemptResult} result */
  async stage(attemptId, result) {
    return this.database.transaction(async () => {
      const attempt = await this.attempt(attemptId);
      if (attempt.state !== 'loading' || attempt.result) fail('stale_attempt', 'The attempt no longer accepts results.');
      await this.requireSession({ installationId: attempt.installation_id, sessionId: attempt.session_id, epoch: attempt.epoch });
      // A generated result is structured content (D09).
      if (typeof result.ok !== 'boolean' || (result.ok && !(result.content && typeof result.content === 'object' && !Array.isArray(result.content)))) fail('invalid', 'Invalid component result.');
      // The model and prompt version that produced it (D11), when known.
      if (result.generation !== undefined && !(result.generation && typeof result.generation.prompt === 'string' &&
        (result.generation.model === null || typeof result.generation.model === 'string'))) fail('invalid', 'Invalid generation record.');
      await this.database.run("UPDATE component_attempts SET result = $1 WHERE id = $2", [JSON.stringify(result), attemptId]);
    });
  }
  /** @param {string} operationId @param {PublishRequest['payload']} payload */
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
      const generated = attempt.result.ok ? validateParentContent(attempt.module.type, attempt.result.content) : null;
      const content = generated ? parentDocument(generated) : textBlocks('');
      const previous = /** @type {Pick<ComponentRow, 'generation'> | undefined} */ (await this.database.one('SELECT generation FROM components WHERE page_id = $1 AND id = $2', [attempt.page_id, attempt.component_id]));
      const generation = generated ? generationAfter(previous?.generation && JSON.parse(previous.generation), attempt.module, generated, attempt.result.generation) : null;
      const changed = await this.database.run(`UPDATE components SET content = $1, status = $2, generation = $6
        WHERE page_id = $3 AND id = $4 AND attempt_id = $5 AND status = 'loading'`,
      [JSON.stringify(content), state, attempt.page_id, attempt.component_id, attemptId, generation && JSON.stringify(generation)]);
      if (!changed.rowCount) fail('stale_attempt', 'The component has moved on to another attempt.');
      await this.database.run("UPDATE component_attempts SET state = $1, result = NULL WHERE id = $2", [state, attemptId]);
      return { pageId: attempt.page_id, componentId: attempt.component_id, state };
    });
  }
  /** @param {string} operationId @param {PageSaveRequest['payload']} payload */
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
        const content = isParentType(component.moduleType) ? parentEdit(component, change.content, change.facet, page)
          : change.facet === undefined ? blockValue(change.content, 'Component content must be a text document.') : fail('invalid', 'Only a parent module has facets.');
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
  /** @param {string} operationId @param {PageCreateRequest['payload']} payload */
  async createPage(operationId, { deckId, mainKey, initial = [] }) {
    return await this.command(operationId, 'create-page', { deckId, mainKey, initial }, async () => {
      const deck = await this.deck(deckId);
      if (!Array.isArray(initial)) fail('invalid', 'Initial content must be a list.');
      /** @type {Map<string, BlockDocument>} */
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
  /** @param {string} operationId @param {ModuleAddRequest['payload']} payload */
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
  /** @param {string} operationId @param {FacetChangePayload} payload */
  async addFacet(operationId, { pageId, componentId, parent, facet }) {
    return await this.command(operationId, 'add-facet', { pageId, componentId, parent, facet }, async () => {
      const page = await this.page(pageId);
      // Undefined when the component is gone: the blocked check then fails the operation.
      const component = /** @type {Component} */ (page.components.find(item => item.id === componentId));
      const blocked = facetAddBlocked(component && { id: component.id, type: component.moduleType, facets: component.facets, status: component.status }, parent, facet);
      if (blocked) fail(component ? 'invalid' : 'deleted', blocked);
      // Not blocked: the facet belongs to the parent, the component's type.
      await this.database.run("UPDATE components SET facets = $1 WHERE page_id = $2 AND id = $3",
        [withFacet(/** @type {ParentType} */ (parent), component.facets ?? [], /** @type {FacetType} */ (facet)), pageId, componentId]);
      return { pageId, componentId };
    });
  }
  // Deleting a facet removes its section from the content and the facet from the
  // instance, so a later Retry does not bring it back.
  /** @param {string} operationId @param {FacetChangePayload} payload */
  async deleteFacet(operationId, { pageId, componentId, parent, facet }) {
    return await this.command(operationId, 'delete-facet', { pageId, componentId, parent, facet }, async () => {
      const page = await this.page(pageId);
      // Undefined when the component is gone: the blocked check then fails the operation.
      const component = /** @type {Component & { facets: string[] }} */ (page.components.find(item => item.id === componentId));
      const holder = component && { id: component.id, type: component.moduleType, facets: component.facets, status: component.status };
      const blocked = component && component.moduleType !== parent ? 'This facet is no longer there.' : facetDeleteBlocked(holder, facet);
      if (blocked) fail(component ? 'invalid' : 'deleted', blocked);
      // Its markdown leaves the content (D09), if there is any yet.
      const data = parentContentOf(component.content);
      const content = data ? parentDocument(withFacetText(data, /** @type {FacetType} */ (facet), undefined)) : component.content;
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
  /** @param {string} operationId @param {ComponentDeleteRequest['payload']} payload */
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
  /** @param {string} operationId @param {ComponentMoveRequest['payload']} payload */
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
  /** @param {readonly Component[]} targets */
  confirmationDigest(targets) {
    return digest(targets.map(component => ({ moduleInstanceId: component.moduleInstanceId, content: component.content })));
  }
  /** @param {string} operationId @param {PageGenerateRequest['payload']} payload @param {{ admit?: (count: number) => void }} [options] */
  async generate(operationId, { pageId, target, session, confirmation }, { admit } = {}) {
    return await this.command(operationId, 'generate', { pageId, target, session, confirmation }, async () => {
      await this.requireSession(session);
      const page = await this.page(pageId);
      if (!target || !['missing', 'page', 'component', 'facet'].includes(target.scope)) fail('invalid', 'Choose what to generate.');
      let targets;
      try { targets = generationTargets(target, page.components); }
      catch (error) { fail('invalid', /** @type {Error} */ (error).message); }
      if (targets.some(component => component.status === 'loading')) fail('generating', 'A component is already generating.');
      // Replacing content needs confirmation. A component with nothing in it has
      // nothing to replace, whether it never generated, failed, or generated
      // nothing (0.6.3; until then any earlier attempt needed confirmation).
      // A facet's own Retry (0.7.3) replaces only its section.
      const facet = target.scope === 'facet' ? target.facet : null;
      // A facet the card's flags rule out has nothing to generate (D17): no attempt starts.
      if (facet && targets.some(component => { const data = parentContentOf(component.content);
        return data && ruledOutOf(/** @type {ParentType} */ (component.moduleType), data)[/** @type {FacetType} */ (facet)]; })) {
        fail('invalid', 'This facet does not apply to this card.');
      }
      // Structured content (D09) is compared as data: a facet's entry, or the whole content.
      const replaced = (/** @type {Component} */ component) => {
        const data = parentContentOf(component.content);
        if (facet) return data && hasFacetContent(data, facet) ? data.facets[/** @type {FacetType} */ (facet)] : null;
        // Structured content emptied of everything has nothing to replace (0.6.3).
        return data ? (isEmptyContent(data) ? null : data) : (blockText(component.content) || null);
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
      return { pageId, attemptIds: (await this.startRun(pageId, session, targets, { facet, mainKey: mainKeyOf(page.components) })).attemptIds };
    });
  }
  // Spoken parts' audio (D24): one clip per spoken line of a component's part.
  // A part's clips are replaced whole when its text is spoken again, and go with
  // their component. Audio is never cached: every clip is spoken anew.
  /** @param {string} pageId @param {string} componentId @param {string} part @param {readonly string[]} lines @param {string} language @returns {Promise<ClipKey[]>} */
  async replaceClips(pageId, componentId, part, lines, language) {
    return this.database.transaction(async () => {
      if (!await this.database.one("SELECT id FROM components WHERE page_id = $1 AND id = $2 AND status = 'completed'", [pageId, componentId])) {
        fail('deleted', 'The component is no longer completed.');
      }
      await this.database.run('DELETE FROM component_audio WHERE page_id = $1 AND component_id = $2 AND part = $3', [pageId, componentId, part]);
      const created = new Date().toISOString();
      for (const [line, text] of lines.entries()) {
        await this.database.run('INSERT INTO component_audio (page_id, component_id, part, line, text, language, token, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [pageId, componentId, part, line, text, language, randomUUID(), created]);
      }
      return lines.map((_, line) => ({ pageId, componentId, part, line }));
    });
  }
  // Removes a component's clips, or only those of the parts named.
  /** @param {string} pageId @param {string} componentId @param {readonly string[]} [parts] */
  async dropClips(pageId, componentId, parts) {
    await this.database.transaction(() => parts
      ? this.database.run('DELETE FROM component_audio WHERE page_id = $1 AND component_id = $2 AND part = ANY($3)', [pageId, componentId, parts])
      : this.database.run('DELETE FROM component_audio WHERE page_id = $1 AND component_id = $2', [pageId, componentId]));
  }
  // A page's clips without their audio, in page order.
  /** @param {string} pageId @returns {Promise<ClipRow[]>} */
  async clips(pageId) {
    return this.database.transaction(async () => {
      await this.page(pageId);
      return /** @type {ClipRow[]} */ (await this.database.all(`SELECT a.component_id, a.part, a.line, a.state, a.error, a.duration_ms FROM component_audio a
        JOIN components c ON c.page_id = a.page_id AND c.id = a.component_id WHERE a.page_id = $1 ORDER BY c.position, a.part, a.line`, [pageId]));
    });
  }
  // One ready clip's audio.
  /** @param {ClipKey} key @returns {Promise<{ mime: string, bytes: Buffer }>} */
  async clipAudio({ pageId, componentId, part, line }) {
    return this.database.transaction(async () => {
      const row = /** @type {{ mime: string, bytes: Buffer } | undefined} */ (await this.database.one(
        "SELECT mime, bytes FROM component_audio WHERE page_id = $1 AND component_id = $2 AND part = $3 AND line = $4 AND state = 'ready'", [pageId, componentId, part, line]));
      if (!row) fail('deleted', 'This audio is unavailable.');
      return row;
    });
  }
  // A waiting clip starts generating; null when it no longer waits. Its token
  // names this version of the clip for finishClip and failClip.
  // Its module type names the part's voice.
  /** @param {ClipKey} key @returns {Promise<{ text: string, language: string, token: string, module_type: string } | null>} */
  async claimClip({ pageId, componentId, part, line }) {
    return this.database.transaction(async () => /** @type {{ text: string, language: string, token: string, module_type: string } | undefined} */ (await this.database.one(
      `UPDATE component_audio a SET state = 'generating' FROM components c
        WHERE a.page_id = $1 AND a.component_id = $2 AND a.part = $3 AND a.line = $4 AND a.state = 'waiting' AND c.page_id = a.page_id AND c.id = a.component_id
        RETURNING a.text, a.language, a.token, c.module_type`,
      [pageId, componentId, part, line])) ?? null);
  }
  // A generating clip's audio, and the speech model and voice in its part's
  // generation record (D24). False when the clip was replaced or deleted meanwhile.
  /** @param {ClipKey} key @param {string} token @param {{ bytes: Buffer, mime: string, durationMs: number, model: string | null, voice: string | null }} audio */
  async finishClip({ pageId, componentId, part, line }, token, { bytes, mime, durationMs, model, voice }) {
    return this.database.transaction(async () => {
      const changed = await this.database.run(`UPDATE component_audio SET state = 'ready', error = NULL, mime = $6, duration_ms = $7, bytes = $8
        WHERE page_id = $1 AND component_id = $2 AND part = $3 AND line = $4 AND token = $5 AND state = 'generating'`, [pageId, componentId, part, line, token, mime, durationMs, bytes]);
      if (!changed.rowCount) return false;
      const row = /** @type {Pick<ComponentRow, 'generation'> | undefined} */ (await this.database.one('SELECT generation FROM components WHERE page_id = $1 AND id = $2', [pageId, componentId]));
      const record = row?.generation ? /** @type {Record<string, GenerationEntry>} */ (JSON.parse(row.generation)) : null;
      if (record?.[part]) {
        record[part] = { ...record[part], speech: { model, voice } };
        await this.database.run('UPDATE components SET generation = $3 WHERE page_id = $1 AND id = $2', [pageId, componentId, JSON.stringify(record)]);
      }
      return true;
    });
  }
  // A waiting or generating clip fails with its error code; with a token, only
  // that version of it.
  /** @param {ClipKey} key @param {string} error @param {string} [token] */
  async failClip({ pageId, componentId, part, line }, error, token) {
    await this.database.transaction(() => this.database.run(`UPDATE component_audio SET state = 'failed', error = $5
      WHERE page_id = $1 AND component_id = $2 AND part = $3 AND line = $4 AND ($6::text IS NULL OR token = $6) AND state IN ('waiting', 'generating')`,
    [pageId, componentId, part, line, error, token ?? null]));
  }
  // A clip's Retry: a ready or failed clip waits to be spoken again. False when
  // it is still waiting or generating.
  /** @param {ClipKey} key */
  async restartClip({ pageId, componentId, part, line }) {
    return this.database.transaction(async () => {
      await this.page(pageId);
      const clip = await this.database.one('SELECT state FROM component_audio WHERE page_id = $1 AND component_id = $2 AND part = $3 AND line = $4', [pageId, componentId, part, line]);
      if (!clip) fail('deleted', 'This audio is unavailable.');
      const changed = await this.database.run(`UPDATE component_audio SET state = 'waiting', token = $5, error = NULL, mime = NULL, duration_ms = NULL, bytes = NULL
        WHERE page_id = $1 AND component_id = $2 AND part = $3 AND line = $4 AND state IN ('ready', 'failed')`, [pageId, componentId, part, line, randomUUID()]);
      return (changed.rowCount ?? 0) > 0;
    });
  }
  // The clips still waiting or generating.
  /** @returns {Promise<ClipKey[]>} */
  async pendingClips() {
    return this.database.transaction(async () => (/** @type {{ page_id: string, component_id: string, part: string, line: number }[]} */ (await this.database.all(
      "SELECT page_id, component_id, part, line FROM component_audio WHERE state IN ('waiting', 'generating')"))).map(row => ({ pageId: row.page_id, componentId: row.component_id, part: row.part, line: row.line })));
  }
  /** @param {string} operationId @param {string} pageId */
  async deletePage(operationId, pageId) {
    return await this.command(operationId, 'delete-page', { pageId }, async () => {
      await this.page(pageId);
      await this.database.run("DELETE FROM pages WHERE id = $1", [pageId]);
      return { pageId };
    });
  }
}
