// @ts-check
// Decks: their configuration, the default deck's snapshot, and the deck list.
import { randomUUID } from 'node:crypto';
import { DECK_COLOURS, validateConfiguration } from '@vocabularium/domain/page-modules';
/** @import { DeckConfiguration } from '@vocabularium/contracts' */
/** @import { AccountRow, DeckModuleRow, DeckRow } from './store-records.js' */
import { fail, encodeCursor, decodeCursor, pageLimit, withFacets } from './store-common.mjs';
import { SessionStore } from './store-sessions.mjs';

export class DeckStore extends SessionStore {
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
  /** @param {string} operationId @param {string} deckId */
  async setDefault(operationId, deckId) {
    return await this.command(operationId, 'set-default', { deckId }, async () => {
      await this.deck(deckId);
      await this.database.run("UPDATE account SET default_deck_id = $1 WHERE id = 1", [deckId]);
      return { defaultDeckId: deckId };
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
}
