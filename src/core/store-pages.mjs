// @ts-check
// Pages and their components: reading and listing pages, and every edit a
// user makes to one (saving, creating, shaping, facets, deleting).
import { randomUUID } from 'node:crypto';
import { blockText, mainKeyOf, pageStatus, textBlocks } from '@vocabularium/domain/pages';
import { addBlocked, copyModules, deleteBlocked, moveBlocked, moved, pageMeaning } from '@vocabularium/domain/page-modules';
import { facetAddBlocked, facetDeleteBlocked, isParentType, withFacet } from '@vocabularium/domain/parents';
import { blankContent, parentContentOf, parentDocument, validateParentContent, withFacetText } from '@vocabularium/domain/content';
import { sortKey } from './sort-key.mjs';
/** @import { BlockDocument, Component, ComponentDeleteRequest, ComponentMoveRequest, FacetChangePayload, ModuleAddRequest, ModuleInstance, Page, PageCreateRequest, PageSaveRequest, ParentHeader } from '@vocabularium/contracts' */
/** @import { FacetType, ParentType } from '@vocabularium/domain/parents' */
/** @import { Attempt, AttemptModule, AttemptRow, ComponentRow, PageRow, PageSummaryRow } from './store-records.js' */
import { fail, encodeCursor, decodeCursor, pageLimit, withFacets } from './store-common.mjs';
import { DeckStore } from './store-decks.mjs';

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

export class PageStore extends DeckStore {
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
  /** @param {string} id @returns {Promise<Attempt>} */
  async attempt(id) {
    return this.database.transaction(async () => {
      const attempt = /** @type {AttemptRow | undefined} */ (await this.database.one("SELECT * FROM component_attempts WHERE id = $1", [id]));
      if (!attempt) fail('deleted', 'The attempt no longer exists.');
      return { ...attempt, module: JSON.parse(attempt.module), result: attempt.result && JSON.parse(attempt.result) };
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
  /** @param {string} operationId @param {string} pageId */
  async deletePage(operationId, pageId) {
    return await this.command(operationId, 'delete-page', { pageId }, async () => {
      await this.page(pageId);
      await this.database.run("DELETE FROM pages WHERE id = $1", [pageId]);
      return { pageId };
    });
  }
}
