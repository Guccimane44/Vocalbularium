import { sql } from 'drizzle-orm';
import { pgTable, text, integer, bigint, bigserial, primaryKey, check, index, unique, uniqueIndex, foreignKey, customType } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

// The local owner-testing account is deliberately a singleton. This is not a
// multi-tenant authorization schema. Stable text IDs preserve the wire contract.
export const decks = pgTable('decks', {
  id: text().primaryKey(), name: text().notNull(), ordinal: bigserial({ mode: 'number' }).notNull(),
  view: text().notNull().default('default')
}, table => [check('deck_view', sql`${table.view} in ('default')`)]);
export const account = pgTable('account', {
  id: integer().primaryKey(), default_deck_id: text().notNull().references(() => decks.id)
}, table => [check('singleton_account', sql`${table.id} = 1`)]);
export const installations = pgTable('installations', {
  id: text().primaryKey(), epoch: bigint({ mode: 'number' }).notNull(), session_id: text().notNull()
}, table => [check('session_epoch', sql`${table.epoch} > 0`)]);
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

// Deck → page → component (Q72).
export const deckModules = pgTable('deck_modules', {
  id: text().primaryKey(), deck_id: text().notNull().references(() => decks.id, { onDelete: 'cascade' }),
  position: integer().notNull(), type: text().notNull()
}, table => [unique('deck_module_position').on(table.deck_id, table.position),
  check('deck_module_limit', sql`${table.position} between 0 and 11`)]);
export const pages = pgTable('pages', {
  id: text().primaryKey(), deck_id: text().notNull().references(() => decks.id, { onDelete: 'cascade' }),
  // Capture origin; null for manual pages. The main key itself is a component.
  selected_text: text(), created_at: text().notNull(),
  main_key_sort_key: bytea().notNull().default(sql`'\\x'::bytea`)
}, table => [
  index('pages_deck_created_desc_id').on(table.deck_id, sql`${table.created_at} COLLATE "C" DESC`, sql`${table.id} COLLATE "C" ASC`),
  index('pages_deck_created_asc_id').on(table.deck_id, sql`${table.created_at} COLLATE "C" ASC`, sql`${table.id} COLLATE "C" ASC`),
  index('pages_deck_main_key_asc_id').on(table.deck_id, table.main_key_sort_key, sql`${table.id} COLLATE "C" ASC`),
  index('pages_deck_main_key_desc_id').on(table.deck_id, sql`${table.main_key_sort_key} DESC`, sql`${table.id} COLLATE "C" ASC`),
  index('pages_recent_captures').on(sql`${table.created_at} COLLATE "C" DESC`, sql`${table.id} COLLATE "C" ASC`).where(sql`${table.selected_text} IS NOT NULL`)
]);
// One generation run shares one interpretation across its attempts.
export const generationRuns = pgTable('generation_runs', {
  id: text().primaryKey(), page_id: text().notNull().references(() => pages.id, { onDelete: 'cascade' }),
  interpretation: text()
}, table => [index('generation_runs_page').on(table.page_id)]);
// module_instance_id has no foreign key: components outlive removed instances.
export const components = pgTable('components', {
  page_id: text().notNull().references(() => pages.id, { onDelete: 'cascade' }),
  id: text().notNull(), kind: text().notNull(), module_instance_id: text(),
  position: integer().notNull(), content: text().notNull(), status: text(), attempt_id: text()
}, table => [primaryKey({ columns: [table.page_id, table.id] }), index('components_attempt').on(table.attempt_id),
  uniqueIndex('components_module_instance').on(table.page_id, table.module_instance_id).where(sql`${table.module_instance_id} IS NOT NULL`),
  uniqueIndex('components_single_main_key').on(table.page_id).where(sql`${table.kind} = 'main_key'`),
  uniqueIndex('components_single_context').on(table.page_id).where(sql`${table.kind} = 'context'`),
  check('component_kind', sql`${table.kind} in ('main_key', 'context', 'module', 'manual')`),
  check('component_owner', sql`(${table.kind} = 'module') = (${table.module_instance_id} IS NOT NULL)`),
  check('component_status', sql`${table.status} in ('loading', 'completed', 'failed')`)]);
export const componentAttempts = pgTable('component_attempts', {
  id: text().primaryKey(), page_id: text().notNull(), component_id: text().notNull(),
  run_id: text().notNull().references(() => generationRuns.id, { onDelete: 'cascade' }),
  installation_id: text().notNull().references(() => installations.id), session_id: text().notNull(),
  epoch: bigint({ mode: 'number' }).notNull(), module: text().notNull(), state: text().notNull().default('loading'), result: text()
}, table => [foreignKey({ columns: [table.page_id, table.component_id], foreignColumns: [components.page_id, components.id] }).onDelete('cascade'),
  index('component_attempts_session_state').on(table.installation_id, table.session_id, table.state),
  index('component_attempts_page_state').on(table.page_id, table.state), index('component_attempts_run').on(table.run_id),
  check('component_attempt_state', sql`${table.state} in ('loading', 'completed', 'failed')`)]);

