// @ts-check
// The store's base: the database, browser sessions, and the receipts that
// make each operation run once (an operation ID replays its first result).
import { Postgres } from '../persistence/postgres.ts';
import { textBlocks } from '@vocabularium/domain/pages';
/** @import { BrowserSession } from '@vocabularium/contracts' */
/** @import { InstallationRow, ReceiptRow } from './store-records.js' */
import { fail, digest } from './store-common.mjs';

// Account mutations are admitted synchronously and commit before acknowledgment.
// Provider work never runs inside the ordered executor or database transaction.
export class SessionStore {
  /** @param {Postgres} database @param {{ outbox?: string | null }} [options] */
  constructor(database, { outbox = null } = {}) {
    this.database = database;
    this.accountId = database.accountId;
    this.outbox = outbox;
  }
  close() { return this.database.close(); }
  ready() { return this.database.ready(); }
  /** @template T @param {() => Promise<T>} action */
  ordered(action) { return this.database.ordered.run(action); }
  /** @template T @param {() => T} action */
  background(action) { return this.database.detached(action); }
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
  async readSequence() {
    const { sequence } = /** @type {Pick<ReceiptRow, 'sequence'>} */ (await this.database.one('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM receipts'));
    return Number(sequence);
  }
}
