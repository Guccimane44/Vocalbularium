import { sql } from 'drizzle-orm';
import { pgTable, text, integer, bigint, bigserial, primaryKey, check, index, unique } from 'drizzle-orm/pg-core';

// The local owner-testing account is deliberately a singleton. This is not a
// multi-tenant authorization schema. Stable text IDs preserve the wire contract.
export const decks = pgTable('decks', {
  id: text().primaryKey(), name: text().notNull(), ordinal: bigserial({ mode: 'number' }).notNull()
});
export const account = pgTable('account', {
  id: integer().primaryKey(), default_deck_id: text().notNull().references(() => decks.id)
}, table => [check('singleton_account', sql`${table.id} = 1`)]);
export const layoutPages = pgTable('layout_pages', {
  id: text().primaryKey(), deck_id: text().notNull().references(() => decks.id, { onDelete: 'cascade' }),
  position: integer().notNull(), modules: text().notNull()
}, table => [index('layout_deck_position').on(table.deck_id, table.position), check('page_position', sql`${table.position} between 0 and 3`)]);
export const installations = pgTable('installations', {
  id: text().primaryKey(), epoch: bigint({ mode: 'number' }).notNull(), session_id: text().notNull()
}, table => [check('session_epoch', sql`${table.epoch} > 0`)]);
export const cards = pgTable('cards', {
  id: text().primaryKey(), deck_id: text().notNull().references(() => decks.id, { onDelete: 'cascade' }),
  selected_text: text(), created_at: text().notNull(), interpretation: text()
}, table => [index('cards_deck_created').on(table.deck_id, table.created_at, table.id)]);
export const pages = pgTable('pages', {
  card_id: text().notNull().references(() => cards.id, { onDelete: 'cascade' }),
  page_id: text().notNull().references(() => layoutPages.id, { onDelete: 'cascade' }),
  text: text().notNull().default(''), status: text(), attempt_id: text()
}, table => [primaryKey({ columns: [table.card_id, table.page_id] }), index('pages_layout').on(table.page_id),
  index('pages_attempt').on(table.attempt_id), check('page_status', sql`${table.status} in ('loading', 'completed', 'failed')`)]);
export const attempts = pgTable('attempts', {
  id: text().primaryKey(), card_id: text().notNull().references(() => cards.id, { onDelete: 'cascade' }),
  page_id: text().notNull().references(() => layoutPages.id, { onDelete: 'cascade' }),
  installation_id: text().notNull().references(() => installations.id), session_id: text().notNull(),
  epoch: bigint({ mode: 'number' }).notNull(), modules: text().notNull(), state: text().notNull().default('loading'), result: text()
}, table => [index('attempts_session_state').on(table.installation_id, table.session_id, table.state),
  index('attempts_card_state').on(table.card_id, table.state), index('attempts_page').on(table.page_id),
  check('attempt_state', sql`${table.state} in ('loading', 'completed', 'failed')`)]);
export const receipts = pgTable('receipts', {
  sequence: bigserial({ mode: 'number' }).primaryKey(), operation_id: text().notNull(),
  fingerprint: text().notNull(), result: text().notNull()
}, table => [unique('receipt_operation').on(table.operation_id)]);
export const credentials = pgTable('credentials', {
  username: text().primaryKey(), salt: text().notNull(), password_hash: text().notNull(),
  account_id: integer().notNull().references(() => account.id)
});
export const loginTokens = pgTable('login_tokens', {
  hash: text().primaryKey(), expires_at: bigint({ mode: 'number' }).notNull(),
  account_id: integer().notNull().references(() => account.id)
}, table => [index('tokens_expiry').on(table.expires_at)]);
