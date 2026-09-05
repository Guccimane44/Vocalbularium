import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const accounts = sqliteTable("accounts", {
  owner: text("owner").primaryKey(),
  email: text("email").notNull(),
  data: text("data").notNull(),
  version: integer("version").notNull().default(0),
  deleted: integer("deleted").notNull().default(0),
});
export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    owner: text("owner").notNull(),
    expires: integer("expires").notNull(),
  },
  (t) => [index("idx_sessions_owner").on(t.owner)],
);
export const challenges = sqliteTable(
  "challenges",
  {
    id: text("id").primaryKey(),
    identity: text("identity").notNull(),
    secretHash: text("secret_hash").notNull(),
    expires: integer("expires").notNull(),
    attempts: integer("attempts").notNull().default(0),
    created: integer("created").notNull(),
    used: integer("used").notNull().default(0),
  },
  (t) => [index("idx_challenges_identity_created").on(t.identity, t.created)],
);
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});
