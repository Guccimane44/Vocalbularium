import { Postgres, OWNER_ACCOUNT_ID } from '../persistence/postgres.ts';
import { createHash, randomUUID } from 'node:crypto';
import { MODULES } from './modules.mjs';
/** @typedef {import('./store-records.js').CardRow} CardRow */
/** @typedef {import('./store-records.js').PageRow} PageRow */
/** @typedef {import('./store-records.js').AttemptRow} AttemptRow */
/** @typedef {import('./store-records.js').ReceiptRow} ReceiptRow */
export class StoreError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const fail = (code, message) => { throw new StoreError(code, message); };
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
// Account mutations are admitted synchronously and commit before acknowledgment.
// Provider work never runs inside the ordered executor or database transaction.
export class AccountStore {
  constructor(database, { outbox = null } = {}) {
    this.database = database;
    this.accountId = database.accountId;
    this.outbox = outbox;
  }
  static async open({ databaseUrl, accountId = OWNER_ACCOUNT_ID, outbox } = {}) {
    if (!databaseUrl)
      throw new Error('DATABASE_URL is required.');
    const database = new Postgres(databaseUrl, accountId);
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
    return this.database.transaction(() => this.database.all("SELECT id, card_id, result FROM attempts WHERE state = 'loading'"));
  }
  async createDeck(name) {
    return this.database.transaction(async () => {
      const id = randomUUID();
      await this.database.run("INSERT INTO decks (id, name) VALUES ($1, $2)", [id, name]);
      for (const [position, type] of ['selected', 'german-examples'].entries()) {
        await this.database.run("INSERT INTO layout_pages VALUES ($1, $2, $3, $4)", [randomUUID(), id, position, JSON.stringify([{ id: randomUUID(), type }])]);
      }
      return await this.deck(id);
    });
  }
  async command(operationId, kind, payload, action) {
    if (typeof operationId !== 'string' || !operationId) fail('invalid', 'An operation ID is required.');
    const fingerprint = createHash('sha256').update(JSON.stringify(canonical([kind, payload]))).digest('hex');
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
        await this.database.run(`UPDATE pages SET text = '', status = 'failed' WHERE attempt_id IN
          (SELECT id FROM attempts WHERE installation_id = $1 AND state = 'loading')`, [installationId]);
        await this.database.run(`UPDATE attempts SET state = 'failed', result = NULL
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
      const deck = await this.database.one("SELECT id, name FROM decks WHERE id = $1", [id]);
      if (!deck) fail('deleted', 'The deck no longer exists.');
      return { ...deck, pages: (await this.database.all("SELECT * FROM layout_pages WHERE deck_id = $1 ORDER BY position", [id])).map(page => ({ id: page.id, modules: JSON.parse(page.modules) })) };
    });
  }
  async snapshot() {
    return this.database.transaction(async () => {
      const { default_deck_id: id } = await this.database.one("SELECT * FROM account", []);
      return await this.deck(id);
    });
  }
  async account() {
    return this.database.transaction(async () => {
      const { default_deck_id: defaultDeckId } = await this.database.one("SELECT * FROM account", []);
      const decks = [];
      for (const { id } of await this.database.all('SELECT id FROM decks ORDER BY ordinal')) decks.push(await this.deck(id));
      const { sequence } = await this.database.one("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM receipts", []);
      return { defaultDeckId, decks, cards: (await this.cards()), sequence: Number(sequence) };
    });
  }
  async setDefault(operationId, deckId) {
    return await this.command(operationId, 'set-default', { deckId }, async () => {
      await this.deck(deckId);
      await this.database.run("UPDATE account SET default_deck_id = $1 WHERE id = 1", [deckId]);
      return { defaultDeckId: deckId };
    });
  }
  async saveDeck(operationId, { deck, basePageIds = [], confirmation }) {
    return await this.command(operationId, 'save-deck', { deck, basePageIds, confirmation }, async () => {
      if (!deck || typeof deck.name !== 'string' || !deck.name.trim() || !Array.isArray(deck.pages) || deck.pages.length < 1 || deck.pages.length > 4) {
        fail('invalid', 'Give the deck a name and choose one to four pages.');
      }
      const pageIds = new Set(), moduleIds = new Set();
      for (const page of deck.pages) {
        if (!page || typeof page.id !== 'string' || !page.id || pageIds.has(page.id) || !Array.isArray(page.modules)) fail('invalid', 'Each page needs its own identity.');
        pageIds.add(page.id);
        for (const module of page.modules) {
          if (!module || typeof module.id !== 'string' || !module.id || moduleIds.has(module.id) || !Object.hasOwn(MODULES, module.type)) fail('invalid', 'Choose supported modules from the library.');
          moduleIds.add(module.id);
        }
      }
      if (!Array.isArray(basePageIds)) fail('invalid', 'The saved page configuration is required.');
      const current = deck.id ? (await this.deck(deck.id)) : null;
      const id = current?.id ?? randomUUID();
      if (current) {
        if (deck.pages[0].id !== current.pages[0].id) fail('front_page', 'The front page must stay first and cannot be removed.');
        const retained = deck.pages.filter(page => current.pages.some(saved => saved.id === page.id)).map(page => page.id);
        if (JSON.stringify(retained) !== JSON.stringify(current.pages.filter(page => pageIds.has(page.id)).map(page => page.id))) fail('invalid', 'Retained pages must keep their order.');
        const newIndex = deck.pages.findIndex(page => !current.pages.some(saved => saved.id === page.id));
        if (newIndex >= 0 && deck.pages.slice(newIndex).some(page => current.pages.some(saved => saved.id === page.id))) fail('invalid', 'New pages must be appended.');
        for (const page of deck.pages) if (basePageIds.includes(page.id) && !current.pages.some(saved => saved.id === page.id)) fail('deleted', 'A page in this draft was deleted. Reopen the saved configuration.');
        const removed = current.pages.filter(page => !pageIds.has(page.id));
        const lostContent = [];
        for (const page of removed) lostContent.push(...await this.database.all("SELECT card_id, page_id, text FROM pages WHERE page_id = $1 AND text != '' ORDER BY card_id", [page.id]));
        if (lostContent.length) {
          const digest = createHash('sha256').update(JSON.stringify(lostContent)).digest('hex');
          if (confirmation !== digest) throw new StoreError('content_loss', 'Removing these pages will delete their saved content, including manual edits, from every affected card.', { confirmation: digest });
        }
        await this.database.run("UPDATE decks SET name = $1 WHERE id = $2", [deck.name.trim(), id]);
        for (const page of removed)
          await this.database.run("DELETE FROM layout_pages WHERE id = $1", [page.id]);
      } else
        await this.database.run("INSERT INTO decks (id, name) VALUES ($1, $2)", [id, deck.name.trim()]);
      for (const [position, page] of deck.pages.entries()) {
        const saved = await this.database.one("SELECT deck_id FROM layout_pages WHERE id = $1", [page.id]);
        if (saved && saved.deck_id !== id) fail('invalid', 'This page belongs to another deck.');
        if (saved)
          await this.database.run("UPDATE layout_pages SET position = $1, modules = $2 WHERE id = $3", [position, JSON.stringify(page.modules), page.id]);
        else {
          await this.database.run("INSERT INTO layout_pages VALUES ($1, $2, $3, $4)", [page.id, id, position, JSON.stringify(page.modules)]);
          await this.database.run("INSERT INTO pages (card_id, page_id) SELECT id, $1 FROM cards WHERE deck_id = $2", [page.id, id]);
        }
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
  async card(id) {
    return this.database.transaction(async () => {
      const card = await this.database.one("SELECT * FROM cards WHERE id = $1", [id]);
      if (!card) fail('deleted', 'The card no longer exists.');
      const pages = await this.database.all(`SELECT p.* FROM pages p JOIN layout_pages l ON l.id = p.page_id
      WHERE card_id = $1 ORDER BY l.position`, [id]);
      const states = pages.map(page => page.status).filter(Boolean);
      const status = states.includes('failed') ? 'failed' : states.includes('loading') ? 'loading'
        : states.length ? 'completed' : null;
      return { ...card, interpretation: card.interpretation ? JSON.parse(card.interpretation) : null, pages, status };
    });
  }
  async cards() {
    return this.database.transaction(async () => {
      const cards = [];
      for (const { id } of await this.database.all('SELECT id FROM cards ORDER BY created_at DESC, id')) cards.push(await this.card(id));
      return cards;
    });
  }
  async capture(operationId, { session, selectedText, snapshot }, { recoverySession } = {}) {
    return await this.command(operationId, 'capture', { session, selectedText, snapshot }, async () => {
      await this.requireSession(recoverySession ?? session);
      const interrupted = recoverySession && (recoverySession.sessionId !== session.sessionId || recoverySession.epoch !== session.epoch);
      if (recoverySession && (recoverySession.installationId !== session.installationId || recoverySession.epoch < session.epoch)) {
        fail('wrong_session', 'Capture recovery belongs to its originating installation.');
      }
      if (typeof selectedText !== 'string' || selectedText.length === 0) fail('invalid', 'Select some text first.');
      const deck = await this.deck(snapshot.id);
      const id = randomUUID();
      await this.database.run("INSERT INTO cards (id, deck_id, selected_text, created_at) VALUES ($1, $2, $3, $4)", [id, deck.id, selectedText, new Date().toISOString()]);
      for (const page of deck.pages) {
        await this.database.run("INSERT INTO pages (card_id, page_id) VALUES ($1, $2)", [id, page.id]);
        const capturedPage = snapshot.pages.find(captured => captured.id === page.id);
        if (capturedPage) {
          const attemptId = await this.startAttempt(id, page.id, session, capturedPage.modules);
          if (interrupted)
            await this.failAttempt(attemptId);
        }
      }
      return { cardId: id, interrupted: Boolean(interrupted) };
    });
  }
  async prepareCapture(operationId, { session, selectedText }) {
    return await this.command(operationId, 'prepare-capture', { session, selectedText }, async () => {
      await this.requireSession(session);
      if (typeof selectedText !== 'string' || !selectedText.length) fail('invalid', 'Select some text first.');
      return { snapshot: (await this.snapshot()) };
    });
  }
  async startAttempt(cardId, pageId, session, modules) {
    const attemptId = randomUUID();
    await this.database.run(`INSERT INTO attempts
      (id, card_id, page_id, installation_id, session_id, epoch, modules) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [attemptId, cardId, pageId, session.installationId, session.sessionId, session.epoch, JSON.stringify(modules)]);
    await this.database.run("UPDATE pages SET text = '', status = 'loading', attempt_id = $1 WHERE card_id = $2 AND page_id = $3", [attemptId, cardId, pageId]);
    return attemptId;
  }
  async attempt(id) {
    return this.database.transaction(async () => {
      const attempt = await this.database.one("SELECT * FROM attempts WHERE id = $1", [id]);
      if (!attempt) fail('deleted', 'The attempt no longer exists.');
      return { ...attempt, modules: JSON.parse(attempt.modules), result: attempt.result && JSON.parse(attempt.result) };
    });
  }
  async failAttempt(attemptId) {
    return this.database.transaction(async () => {
      await this.database.run("UPDATE pages SET text = '', status = 'failed' WHERE attempt_id = $1 AND status = 'loading'", [attemptId]);
      await this.database.run("UPDATE attempts SET state = 'failed', result = NULL WHERE id = $1 AND state = 'loading'", [attemptId]);
    });
  }
  async establishInterpretation(cardId, interpretation, attemptIds) {
    return this.database.transaction(async () => {
      const card = await this.card(cardId);
      if (card.interpretation) return card.interpretation;
      const active = await this.database.all("SELECT id FROM attempts WHERE card_id = $1 AND state = 'loading'", [cardId]);
      if (!active.some(attempt => !attemptIds || attemptIds.includes(attempt.id))) {
        fail('stale_attempt', 'No active attempt requires this interpretation.');
      }
      await this.database.run("UPDATE cards SET interpretation = $1 WHERE id = $2 AND interpretation IS NULL", [JSON.stringify(interpretation), cardId]);
      return interpretation;
    });
  }
  async pendingAttempts(session) {
    return this.database.transaction(async () => {
      await this.requireSession(session);
      const attempts = [];
      for (const { id } of await this.database.all("SELECT id FROM attempts WHERE installation_id = $1 AND session_id = $2 AND state = 'loading'", [session.installationId, session.sessionId])) attempts.push(await this.attempt(id));
      return attempts;
    });
  }
  // Provider completion only stages a result. It cannot publish page content.
  async stage(attemptId, result) {
    return this.database.transaction(async () => {
      const attempt = await this.attempt(attemptId);
      if (attempt.state !== 'loading' || attempt.result) fail('stale_attempt', 'The attempt no longer accepts results.');
      await this.requireSession({ installationId: attempt.installation_id, sessionId: attempt.session_id, epoch: attempt.epoch });
      if (typeof result.ok !== 'boolean' || (result.ok && typeof result.text !== 'string')) fail('invalid', 'Invalid page result.');
      await this.database.run("UPDATE attempts SET result = $1 WHERE id = $2", [JSON.stringify(result), attemptId]);
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
      const text = attempt.result.ok ? attempt.result.text : '';
      const changed = await this.database.run(`UPDATE pages SET text = $1, status = $2
        WHERE card_id = $3 AND page_id = $4 AND attempt_id = $5 AND status = 'loading'`, [text, state, attempt.card_id, attempt.page_id, attemptId]);
      if (!changed.rowCount) fail('stale_attempt', 'The page has moved on to another attempt.');
      await this.database.run("UPDATE attempts SET state = $1, result = NULL WHERE id = $2", [state, attemptId]);
      return { cardId: attempt.card_id, pageId: attempt.page_id, state };
    });
  }
  async savePages(operationId, { cardId, changes }) {
    return await this.command(operationId, 'save-pages', { cardId, changes }, async () => {
      const card = await this.card(cardId);
      if (!Array.isArray(changes) || changes.some(change => !change || typeof change !== 'object') ||
        new Set(changes.map(change => change.pageId)).size !== changes.length) fail('invalid', 'Choose each changed page once.');
      for (const change of changes) {
        const page = card.pages.find(page => page.page_id === change.pageId);
        if (!page) fail('deleted', 'A changed page no longer exists.');
        if (page.status === 'loading') fail('generating', 'A page is still generating. Your drafts are preserved.');
        if (typeof change.text !== 'string') fail('invalid', 'Page content must be text.');
      }
      for (const change of changes)
        await this.database.run("UPDATE pages SET text = $1 WHERE card_id = $2 AND page_id = $3", [change.text, cardId, change.pageId]);
      return { cardId };
    });
  }
  async createManual(operationId, { deckId, pages }) {
    return await this.command(operationId, 'create-manual', { deckId, pages }, async () => {
      const deck = await this.deck(deckId);
      if (!Array.isArray(pages) || pages.some(page => !page || typeof page !== 'object') ||
        new Set(pages.map(page => page.pageId)).size !== pages.length || pages.some(page => typeof page.text !== 'string')) fail('invalid', 'Each page needs plain-text content.');
      for (const page of pages) if (!deck.pages.some(saved => saved.id === page.pageId)) fail('deleted', 'A page in this draft was deleted. Your draft is preserved.');
      const id = randomUUID();
      await this.database.run("INSERT INTO cards (id, deck_id, selected_text, created_at) VALUES ($1, $2, NULL, $3)", [id, deckId, new Date().toISOString()]);
      for (const page of deck.pages)
        await this.database.run("INSERT INTO pages (card_id, page_id, text) VALUES ($1, $2, $3)", [id, page.id, pages.find(draft => draft.pageId === page.id)?.text ?? '']);
      return { cardId: id };
    });
  }
  async retry(operationId, { cardId, pageId, session }) {
    return await this.command(operationId, 'retry', { cardId, pageId, session }, async () => {
      await this.requireSession(session);
      const card = await this.card(cardId);
      if (card.selected_text === null) fail('manual_card', 'Manual cards have no generation input.');
      const page = card.pages.find(page => page.page_id === pageId);
      if (!page) fail('deleted', 'The page no longer exists.');
      if (page.status === 'loading') fail('generating', 'This page is already generating.');
      const layout = (await this.deck(card.deck_id)).pages.find(page => page.id === pageId);
      return { attemptId: (await this.startAttempt(cardId, pageId, session, layout.modules)) };
    });
  }
  async deleteCard(operationId, cardId) {
    return await this.command(operationId, 'delete-card', { cardId }, async () => {
      await this.card(cardId);
      await this.database.run("DELETE FROM cards WHERE id = $1", [cardId]);
      return { cardId };
    });
  }
}
