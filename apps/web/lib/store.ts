import { DomainError, initialState, type AccountState } from "./domain";
export interface Statement {
  bind(...args: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
export class Store {
  constructor(public db: Database) {}
  async ensure(owner: string, email: string, mode: "preview" | "live") {
    await this.db
      .prepare(
        "INSERT INTO accounts(owner,email,data,version,deleted) VALUES(?,?,?,0,0) ON CONFLICT(owner) DO NOTHING",
      )
      .bind(owner, email, JSON.stringify(initialState(owner, email, mode)))
      .run();
    return this.read(owner);
  }
  async read(owner: string): Promise<AccountState> {
    const row = await this.db
      .prepare("SELECT data,version,deleted FROM accounts WHERE owner=?")
      .bind(owner)
      .first<{ data: string; version: number; deleted: number }>();
    if (!row) throw new DomainError(401, "Sign in to continue.");
    if (row.deleted) throw new DomainError(410, "This account has been deleted.");
    const state = JSON.parse(row.data) as AccountState;
    state.revision = row.version;
    return state;
  }
  async mutate<T>(
    owner: string,
    fn: (state: AccountState) => T,
  ): Promise<{ result: T; state: AccountState }> {
    // Pure callbacks may be replayed after a compare-and-swap conflict. No network work in callbacks.
    for (let attempt = 0; attempt < 12; attempt++) {
      const state = await this.read(owner),
        base = state.revision;
      const result = fn(state);
      state.revision = base + 1;
      const data = JSON.stringify(state);
      if (new TextEncoder().encode(data).length > 1_800_000)
        throw new DomainError(
          409,
          "Your library has reached the MVP storage limit. Export your library before continuing.",
        );
      const r = await this.db
        .prepare(
          "UPDATE accounts SET data=?,version=version+1 WHERE owner=? AND version=? AND deleted=0",
        )
        .bind(data, owner, base)
        .run();
      if (r.meta.changes === 1) return { result, state };
    }
    throw new DomainError(409, "Another device is updating your library. Please retry.");
  }
  async delete(owner: string) {
    await this.db.batch([
      this.db
        .prepare("UPDATE accounts SET data=?,deleted=1,version=version+1,email=? WHERE owner=?")
        .bind("{}", "", owner),
      this.db.prepare("DELETE FROM sessions WHERE owner=?").bind(owner),
    ]);
  }
}
