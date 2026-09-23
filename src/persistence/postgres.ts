import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { credentials, loginTokens } from './schema.ts';

export const OWNER_ACCOUNT_ID = 1;

// Admission is synchronous. A database lock protects transactions but does not
// define arrival order. Nested work shares admission only while its owner runs.
export class OrderedExecutor {
  private tail: Promise<unknown> = Promise.resolve();
  private context = new AsyncLocalStorage<{ active: boolean }>();
  run<T>(action: () => Promise<T>): Promise<T> {
    if (this.context.getStore()?.active) return action();
    const result = this.tail.then(async () => {
      const scope = { active: true };
      try { return await this.context.run(scope, action); }
      finally { scope.active = false; }
    });
    this.tail = result.catch(() => {});
    return result;
  }
  detached<T>(action: () => T): T { return this.context.exit(action); }
  async drain() { await this.tail; }
}

type Transaction = { client: pg.PoolClient; active: boolean };
export class Postgres {
  readonly ordered = new OrderedExecutor();
  private readonly pool: pg.Pool;
  private readonly context = new AsyncLocalStorage<Transaction>();
  private owner?: pg.PoolClient;
  private unavailable = false;
  private closed = false;

  readonly accountId: number;
  constructor(databaseUrl: string, accountId = OWNER_ACCOUNT_ID) {
    this.accountId = accountId;
    if (accountId !== OWNER_ACCOUNT_ID) throw new Error('Only the local owner account is supported.');
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 5,
      connectionTimeoutMillis: 3000, idleTimeoutMillis: 30_000,
      types: { getTypeParser: (oid: number, format?: string) => oid === 20 ? (value: string) => {
        const number = Number(value);
        if (!Number.isSafeInteger(number)) throw new Error("Database integer exceeds the safe range.");
        return number;
      } : pg.types.getTypeParser(oid, format as "text") },
      statement_timeout: 10_000, lock_timeout: 3000, idle_in_transaction_session_timeout: 15_000 });
    this.pool.on('error', () => { /* Checked requests surface a safe persistence error. */ });
  }
  async initialize() {
    this.owner = await this.pool.connect();
    this.owner.on('error', () => { this.unavailable = true; });
    const version = await this.owner.query('SHOW server_version_num');
    if (Number(version.rows[0].server_version_num) < 180000 || Number(version.rows[0].server_version_num) >= 190000) {
      throw new Error('PostgreSQL 18 is required.');
    }
    const lock = await this.owner.query('SELECT pg_try_advisory_lock(172910, $1) AS owned', [this.accountId]);
    if (!lock.rows[0].owned) throw new Error('This account database already has an API owner. Run one API process.');
    await this.owner.query('SELECT id FROM account LIMIT 1');
  }
  detached<T>(action: () => T): T { return this.context.exit(() => this.ordered.detached(action)); }
  private async assertOwnership() {
    if (this.closed || this.unavailable || !this.owner) throw new Error('Database ownership was lost; restart the API.');
    try { await this.owner.query('SELECT 1'); }
    catch (error) { this.unavailable = true; throw error; }
  }
  ready() {
    return this.ordered.run(async () => {
      await this.assertOwnership();
      await this.pool.query('SELECT 1');
    });
  }
  transaction<T>(action: () => Promise<T>): Promise<T> {
    if (this.context.getStore()?.active) return action();
    return this.ordered.run(async () => {
      await this.assertOwnership();
      const client = await this.pool.connect();
      const scope = { client, active: true };
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
        await client.query('SELECT id FROM account WHERE id = $1 FOR UPDATE', [this.accountId]);
        const value = await this.context.run(scope, action);
        await this.assertOwnership();
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { scope.active = false; client.release(); }
    });
  }
  private client() {
    const transaction = this.context.getStore();
    if (!transaction?.active) throw new Error('Account queries require a transaction.');
    return transaction.client;
  }
  async all<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
    return (await this.client().query<T>(text, values)).rows;
  }
  async one<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<T | undefined> {
    return (await this.all<T>(text, values))[0];
  }
  async run(text: string, values: unknown[] = []) {
    return this.client().query(text, values);
  }
  credential() {
    return this.transaction(async () => (await drizzle(this.client()).select().from(credentials)
      .where(eq(credentials.account_id, this.accountId)))[0]);
  }
  seedCredential(salt: string, passwordHash: string) {
    return this.transaction(async () => {
      await drizzle(this.client()).insert(credentials).values({ username: 'admin', salt, password_hash: passwordHash, account_id: this.accountId }).onConflictDoNothing();
    });
  }
  saveToken(hash: string, expiresAt: number, now: number) {
    return this.transaction(async () => {
      await this.run('DELETE FROM login_tokens WHERE account_id = $1 AND expires_at <= $2', [this.accountId, now]);
      await drizzle(this.client()).insert(loginTokens).values({ hash, expires_at: expiresAt, account_id: this.accountId });
    });
  }
  token(hash: string) {
    return this.transaction(async () => (await drizzle(this.client()).select().from(loginTokens)
      .where(eq(loginTokens.hash, hash)))[0]);
  }
  revokeToken(hash: string) {
    return this.transaction(async () => { await drizzle(this.client()).delete(loginTokens).where(eq(loginTokens.hash, hash)); });
  }
  async close() {
    if (this.closed) return;
    await this.ordered.drain();
    this.closed = true;
    if (this.owner) {
      if (!this.unavailable) await this.owner.query('SELECT pg_advisory_unlock(172910, $1)', [this.accountId]).catch(() => {});
      this.owner.release(true);
    }
    await this.pool.end();
  }
}
