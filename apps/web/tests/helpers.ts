import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Store, type Database, type Statement } from "../lib/store";
export function database(path = ":memory:") {
  const db = new DatabaseSync(path);
  const schema = readFileSync(
    new URL("../drizzle/0000_flawless_morlocks.sql", import.meta.url),
    "utf8",
  );
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'").get())
    db.exec(schema);
  class Query implements Statement {
    args: unknown[] = [];
    constructor(public sql: string) {}
    bind(...args: unknown[]) {
      const q = new Query(this.sql);
      q.args = args;
      return q;
    }
    async first<T>() {
      return (db.prepare(this.sql).get(...(this.args as any[])) as T) ?? null;
    }
    async all<T>() {
      return { results: db.prepare(this.sql).all(...(this.args as any[])) as T[] };
    }
    async run() {
      const r = db.prepare(this.sql).run(...(this.args as any[]));
      return { meta: { changes: Number(r.changes) } };
    }
  }
  const binding: Database = {
    prepare: (sql) => new Query(sql),
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { store: new Store(binding), db, close: () => db.close() };
}
