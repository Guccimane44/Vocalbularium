import { defineFacet, list, object, table, text } from '../../../../blocks.js';

// A table of the grammar word's declension (D17): for a noun its four cases,
// singular and plural, with the article; for an adjective its strong, weak and
// mixed declension by gender and plural. Only for a noun or an adjective.
export default defineFacet({
  id: 'declension', label: 'Declension', abbreviation: 'De', description: 'The declension of a German noun or adjective.',
  applies: ['word_phrase'], output: 'text',
  when: core => ['noun', 'adjective'].includes(String(core.gramRole ?? '').toLowerCase()),
  shape: object({ columns: list(text(), { name: 'the columns', each: 'Column' }), rows: list(object({ label: text('the case'), cells: list(text(), { name: 'the forms', each: 'Form' }) }), { name: 'the rows', each: 'Row' }) }),
  format: value => table(value.columns, value.rows),
  checks: [{
    id: 'complete-table', description: 'Four cases for a noun, or four cases in each of the strong, weak and mixed declensions for an adjective, each with a form in every column.',
    test: value => ![4, 12].includes(value.rows.length) ? `${value.rows.length} rows, expected 4 or 12`
      : value.rows.map(row => row.cells.length !== value.columns.length ? `"${row.label}" has ${row.cells.length} forms for ${value.columns.length} columns`
        : row.cells.some(cell => !cell.trim()) ? `"${row.label}" has an empty form` : null).find(Boolean) ?? null
  }]
});
