import { blockText } from '@vocabularium/domain/pages';
import { escapeMarkdown, highlightKey } from '@vocabularium/domain/markdown';
import { parentContentOf, parentDocument, withKeyHighlighted } from '@vocabularium/domain/content';
import { isParentType } from '@vocabularium/domain/parents';

// One-time conversions of stored content (D10, amended a fourth time), run by
// `npm run db:migrate` after the schema migrations, each in a transaction and
// recorded in data_migrations so it runs only once.
export const DATA_MIGRATIONS = [
  // The main key's emphasis, drawn by the card until 0.7.5, becomes a stored
  // highlight in every parent's core and facets, so the card reads as before.
  { name: '0.7.5-main-key-highlights', async run(client) {
    const { rows } = await client.query(`SELECT c.page_id, c.id, c.module_type, c.content, key.content AS key FROM components c
      JOIN components key ON key.page_id = c.page_id AND key.module_type = 'main-key' WHERE c.module_type <> 'main-key'`);
    for (const row of rows) {
      if (!isParentType(row.module_type)) continue;
      const data = parentContentOf(JSON.parse(row.content));
      if (!data) continue;
      const content = JSON.stringify(parentDocument(withKeyHighlighted(data, blockText(JSON.parse(row.key)))));
      if (content !== row.content) await client.query('UPDATE components SET content = $1 WHERE page_id = $2 AND id = $3', [content, row.page_id, row.id]);
    }
  } },
  // Context and Text become markdown, read as before: their plain text is
  // escaped, and the main key in a Context is highlighted as a parent's is.
  { name: '0.7.5-notes-markdown', async run(client) {
    const { rows } = await client.query(`SELECT c.page_id, c.id, c.module_type, c.content, key.content AS key FROM components c
      JOIN components key ON key.page_id = c.page_id AND key.module_type = 'main-key' WHERE c.module_type IN ('context', 'text')`);
    for (const row of rows) {
      const document = JSON.parse(row.content);
      const mainKey = row.module_type === 'context' ? blockText(JSON.parse(row.key)) : '';
      const blocks = document.blocks.map(block => block.type === 'paragraph' ? { ...block, text: highlightKey(escapeMarkdown(block.text), mainKey) } : block);
      const content = JSON.stringify({ ...document, blocks });
      if (content !== row.content) await client.query('UPDATE components SET content = $1 WHERE page_id = $2 AND id = $3', [content, row.page_id, row.id]);
    }
  } }
];

export async function runDataMigrations(client, migrations = DATA_MIGRATIONS) {
  for (const migration of migrations) {
    await client.query('BEGIN');
    try {
      const done = await client.query('SELECT 1 FROM data_migrations WHERE name = $1', [migration.name]);
      if (!done.rowCount) {
        await migration.run(client);
        await client.query('INSERT INTO data_migrations (name) VALUES ($1)', [migration.name]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
}
