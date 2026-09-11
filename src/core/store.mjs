import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

export class StoreError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new StoreError(code, message); };
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

// A single synchronous writer gives complete commands an explicit arrival order.
// No generation or network work runs inside these transactions.
export class AccountStore {
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS decks (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS layout_pages (
        id TEXT PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        position INTEGER NOT NULL, modules TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS account (
        id INTEGER PRIMARY KEY CHECK (id = 1), default_deck_id TEXT REFERENCES decks(id));
      CREATE TABLE IF NOT EXISTS installations (
        id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, session_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        selected_text TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pages (
        card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        page_id TEXT NOT NULL REFERENCES layout_pages(id) ON DELETE CASCADE,
        text TEXT NOT NULL DEFAULT '', status TEXT, attempt_id TEXT,
        PRIMARY KEY (card_id, page_id));
      CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        page_id TEXT NOT NULL REFERENCES layout_pages(id) ON DELETE CASCADE,
        installation_id TEXT NOT NULL, session_id TEXT NOT NULL, epoch INTEGER NOT NULL,
        modules TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'loading', result TEXT);
      CREATE TABLE IF NOT EXISTS receipts (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT UNIQUE NOT NULL,
        fingerprint TEXT NOT NULL, result TEXT NOT NULL);
    `);
    if (!this.db.prepare('SELECT id FROM account').get()) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const deck = this.createDeck('My Deck');
        this.db.prepare('INSERT INTO account VALUES (1, ?)').run(deck.id);
        this.db.exec('COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
  }
  close() { this.db.close(); }

  createDeck(name) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO decks VALUES (?, ?)').run(id, name);
    for (const [position, type] of ['selected', 'german-examples'].entries()) {
      this.db.prepare('INSERT INTO layout_pages VALUES (?, ?, ?, ?)')
        .run(randomUUID(), id, position, JSON.stringify([{ id: randomUUID(), type }]));
    }
    return this.deck(id);
  }

  command(operationId, kind, payload, action) {
    if (typeof operationId !== 'string' || !operationId) fail('invalid', 'An operation ID is required.');
    const fingerprint = createHash('sha256').update(JSON.stringify(canonical([kind, payload]))).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const receipt = this.db.prepare('SELECT * FROM receipts WHERE operation_id = ?').get(operationId);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) fail('operation_reused', 'Operation ID belongs to another change.');
        this.db.exec('COMMIT');
        return { ...JSON.parse(receipt.result), sequence: receipt.sequence, replayed: true };
      }
      const result = action();
      const { lastInsertRowid } = this.db.prepare(
        'INSERT INTO receipts (operation_id, fingerprint, result) VALUES (?, ?, ?)')
        .run(operationId, fingerprint, JSON.stringify(result));
      this.db.exec('COMMIT');
      return { ...result, sequence: Number(lastInsertRowid), replayed: false };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  openSession(operationId, session) {
    return this.command(operationId, 'open-session', session, () => {
      const { installationId, epoch, sessionId } = session;
      if (!installationId || !sessionId || !Number.isSafeInteger(epoch) || epoch < 1) {
        fail('invalid', 'A valid installation and browser session are required.');
      }
      const previous = this.db.prepare('SELECT * FROM installations WHERE id = ?').get(installationId);
      if (previous && (previous.epoch > epoch || (previous.epoch === epoch && previous.session_id !== sessionId))) {
        fail('stale_session', 'This browser session has ended.');
      }
      if (previous && previous.session_id !== sessionId) {
        this.db.prepare(`UPDATE pages SET text = '', status = 'failed' WHERE attempt_id IN
          (SELECT id FROM attempts WHERE installation_id = ? AND state = 'loading')`).run(installationId);
        this.db.prepare(`UPDATE attempts SET state = 'failed', result = NULL
          WHERE installation_id = ? AND state = 'loading'`).run(installationId);
      }
      this.db.prepare(`INSERT INTO installations VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET epoch = excluded.epoch, session_id = excluded.session_id`)
        .run(installationId, epoch, sessionId);
      return { session };
    });
  }

  requireSession(session) {
    const current = this.db.prepare('SELECT * FROM installations WHERE id = ?').get(session.installationId);
    if (!current || current.epoch !== session.epoch || current.session_id !== session.sessionId) {
      fail('stale_session', 'This browser session has ended.');
    }
  }
  deck(id) {
    const deck = this.db.prepare('SELECT * FROM decks WHERE id = ?').get(id);
    if (!deck) fail('deleted', 'The deck no longer exists.');
    return { ...deck, pages: this.db.prepare('SELECT * FROM layout_pages WHERE deck_id = ? ORDER BY position')
      .all(id).map(page => ({ id: page.id, modules: JSON.parse(page.modules) })) };
  }
  snapshot() {
    const { default_deck_id: id } = this.db.prepare('SELECT * FROM account').get();
    return this.deck(id);
  }
  account() {
    const { default_deck_id: defaultDeckId } = this.db.prepare('SELECT * FROM account').get();
    const decks = this.db.prepare('SELECT id FROM decks ORDER BY rowid').all().map(({ id }) => this.deck(id));
    const { sequence } = this.db.prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM receipts').get();
    return { defaultDeckId, decks, cards: this.cards(), sequence };
  }
  setDefault(operationId, deckId) {
    return this.command(operationId, 'set-default', { deckId }, () => {
      this.deck(deckId);
      this.db.prepare('UPDATE account SET default_deck_id = ? WHERE id = 1').run(deckId);
      return { defaultDeckId: deckId };
    });
  }
  card(id) {
    const card = this.db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
    if (!card) fail('deleted', 'The card no longer exists.');
    const pages = this.db.prepare(`SELECT p.* FROM pages p JOIN layout_pages l ON l.id = p.page_id
      WHERE card_id = ? ORDER BY l.position`).all(id);
    const states = pages.map(page => page.status).filter(Boolean);
    const status = states.includes('failed') ? 'failed' : states.includes('loading') ? 'loading'
      : states.length ? 'completed' : null;
    return { ...card, pages, status };
  }
  cards() { return this.db.prepare('SELECT id FROM cards ORDER BY created_at DESC, id').all().map(({ id }) => this.card(id)); }

  capture(operationId, { session, selectedText, snapshot }) {
    return this.command(operationId, 'capture', { session, selectedText, snapshot }, () => {
      this.requireSession(session);
      if (typeof selectedText !== 'string' || selectedText.length === 0) fail('invalid', 'Select some text first.');
      const deck = this.deck(snapshot.id);
      const id = randomUUID();
      this.db.prepare('INSERT INTO cards VALUES (?, ?, ?, ?)').run(id, deck.id, selectedText, new Date().toISOString());
      for (const page of deck.pages) {
        this.db.prepare('INSERT INTO pages (card_id, page_id) VALUES (?, ?)').run(id, page.id);
        const capturedPage = snapshot.pages.find(captured => captured.id === page.id);
        if (capturedPage) this.startAttempt(id, page.id, session, capturedPage.modules);
      }
      return { cardId: id };
    });
  }

  startAttempt(cardId, pageId, session, modules) {
    const attemptId = randomUUID();
    this.db.prepare(`INSERT INTO attempts
      (id, card_id, page_id, installation_id, session_id, epoch, modules) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(attemptId, cardId, pageId, session.installationId, session.sessionId, session.epoch, JSON.stringify(modules));
    this.db.prepare(`UPDATE pages SET text = '', status = 'loading', attempt_id = ? WHERE card_id = ? AND page_id = ?`)
      .run(attemptId, cardId, pageId);
    return attemptId;
  }
  attempt(id) {
    const attempt = this.db.prepare('SELECT * FROM attempts WHERE id = ?').get(id);
    if (!attempt) fail('deleted', 'The attempt no longer exists.');
    return { ...attempt, modules: JSON.parse(attempt.modules), result: attempt.result && JSON.parse(attempt.result) };
  }

  // Provider completion only stages a result. It cannot publish page content.
  stage(attemptId, result) {
    const attempt = this.attempt(attemptId);
    if (attempt.state !== 'loading' || attempt.result) fail('stale_attempt', 'The attempt no longer accepts results.');
    this.requireSession({ installationId: attempt.installation_id, sessionId: attempt.session_id, epoch: attempt.epoch });
    if (typeof result.ok !== 'boolean' || (result.ok && typeof result.text !== 'string')) fail('invalid', 'Invalid page result.');
    this.db.prepare('UPDATE attempts SET result = ? WHERE id = ?').run(JSON.stringify(result), attemptId);
  }

  publish(operationId, { attemptId, session }) {
    return this.command(operationId, 'publish', { attemptId, session }, () => {
      this.requireSession(session);
      const attempt = this.attempt(attemptId);
      if (attempt.installation_id !== session.installationId || attempt.session_id !== session.sessionId) {
        fail('wrong_session', 'Only the originating browser session can publish this result.');
      }
      if (attempt.state !== 'loading' || !attempt.result) fail('stale_attempt', 'No current result is ready.');
      const state = attempt.result.ok ? 'completed' : 'failed';
      const text = attempt.result.ok ? attempt.result.text : '';
      const changed = this.db.prepare(`UPDATE pages SET text = ?, status = ?
        WHERE card_id = ? AND page_id = ? AND attempt_id = ? AND status = 'loading'`)
        .run(text, state, attempt.card_id, attempt.page_id, attemptId);
      if (!changed.changes) fail('stale_attempt', 'The page has moved on to another attempt.');
      this.db.prepare('UPDATE attempts SET state = ?, result = NULL WHERE id = ?').run(state, attemptId);
      return { cardId: attempt.card_id, pageId: attempt.page_id, state };
    });
  }

  savePages(operationId, { cardId, changes }) {
    return this.command(operationId, 'save-pages', { cardId, changes }, () => {
      const card = this.card(cardId);
      for (const change of changes) {
        const page = card.pages.find(page => page.page_id === change.pageId);
        if (!page) fail('deleted', 'A changed page no longer exists.');
        if (page.status === 'loading') fail('generating', 'A page is still generating. Your drafts are preserved.');
        if (typeof change.text !== 'string') fail('invalid', 'Page content must be text.');
      }
      for (const change of changes) this.db.prepare('UPDATE pages SET text = ? WHERE card_id = ? AND page_id = ?')
        .run(change.text, cardId, change.pageId);
      return { cardId };
    });
  }

  retry(operationId, { cardId, pageId, session }) {
    return this.command(operationId, 'retry', { cardId, pageId, session }, () => {
      this.requireSession(session);
      const card = this.card(cardId);
      if (card.selected_text === null) fail('manual_card', 'Manual cards have no generation input.');
      const page = card.pages.find(page => page.page_id === pageId);
      if (!page) fail('deleted', 'The page no longer exists.');
      if (page.status === 'loading') fail('generating', 'This page is already generating.');
      const layout = this.deck(card.deck_id).pages.find(page => page.id === pageId);
      return { attemptId: this.startAttempt(cardId, pageId, session, layout.modules) };
    });
  }

  deleteCard(operationId, cardId) {
    return this.command(operationId, 'delete-card', { cardId }, () => {
      this.card(cardId);
      this.db.prepare('DELETE FROM cards WHERE id = ?').run(cardId);
      return { cardId };
    });
  }
}
