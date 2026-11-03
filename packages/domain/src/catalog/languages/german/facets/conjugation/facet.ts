import { defineFacet, list, object, table, text } from '../../../../blocks.js';

// A table of the grammar word's conjugation (D17): a column per tense, a row
// per person. Only for a verb.
export default defineFacet({
  id: 'conjugation', label: 'Conjugation', abbreviation: 'Co', description: 'The conjugation of a German verb.',
  applies: ['word_phrase'], output: 'text',
  when: core => String(core.gramRole ?? '').toLowerCase() === 'verb',
  shape: object({ columns: list(text(), { name: 'the columns', each: 'Column' }), rows: list(object({ label: text('the person'), cells: list(text(), { name: 'the forms', each: 'Form' }) }), { name: 'the rows', each: 'Row' }) }),
  format: value => table(value.columns, value.rows),
  checks: [{
    id: 'complete-table', description: 'A row per person (ich, du, er/sie/es, wir, ihr, sie/Sie), each with a form in every column.',
    test: value => ![6].includes(value.rows.length) ? `${value.rows.length} rows, expected 6`
      : value.rows.map(row => row.cells.length !== value.columns.length ? `"${row.label}" has ${row.cells.length} forms for ${value.columns.length} columns`
        : row.cells.some(cell => !cell.trim()) ? `"${row.label}" has an empty form` : null).find(Boolean) ?? null
  }]
});
