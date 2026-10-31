// @ts-check
// The account's store. Its parts build on one another, one concern each:
// sessions and receipts (store-sessions.mjs), decks, pages and components,
// generation, and audio. This last part adds the account itself and its
// language, and creating and deleting a deck, which can fall back on the
// default deck a new account starts with (defined by the catalog).
import { Postgres, OWNER_ACCOUNT_ID } from '../persistence/postgres.ts';
import { randomUUID } from 'node:crypto';
import { INTERFACE_LANGUAGES } from '@vocabularium/contracts';
import { DEFAULT_DECK_MODULES } from '@vocabularium/domain/parents';
/** @import { DeckDeleteRequest } from '@vocabularium/contracts' */
/** @import { AccountRow, DeckRow } from './store-records.js' */
import { fail } from './store-common.mjs';
import { AudioStore } from './store-audio.mjs';
export { StoreError } from './store-common.mjs';

// A new account's My Deck, from the catalog (D08).
export { DEFAULT_DECK_MODULES };

export class AccountStore extends AudioStore {
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
  async account() {
    return this.database.transaction(async () => {
      const { default_deck_id: defaultDeckId, language } = /** @type {AccountRow} */ (await this.database.one("SELECT * FROM account", []));
      const decks = [];
      for (const { id } of /** @type {Pick<DeckRow, 'id'>[]} */ (await this.database.all('SELECT id FROM decks ORDER BY ordinal'))) decks.push(await this.deck(id));
      return { defaultDeckId, language, decks, pages: (await this.pages()), sequence: await this.readSequence() };
    });
  }
  async summary() {
    return this.database.transaction(async () => {
      const { default_deck_id: defaultDeckId, language } = /** @type {AccountRow} */ (await this.database.one('SELECT default_deck_id, language FROM account WHERE id = $1', [this.accountId]));
      const listed = await this.listDecks();
      return { defaultDeckId, language, defaultDeckSnapshot: await this.deck(defaultDeckId), ...listed };
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
}
