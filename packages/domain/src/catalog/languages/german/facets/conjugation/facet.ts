import { defineFacet, list, object, table, text } from '../../../../blocks.js';

// A table of the grammar word's conjugation (D17): a column per tense, a row
// per person. Only for a verb.
export default defineFacet({
  id: 'conjugation', label: 'Conjugation', abbreviation: 'Co', description: 'The conjugation of a German verb.',
  applies: ['word_phrase'], output: 'text',
  when: core => String(core.gramRole ?? '').toLowerCase() === 'verb',
  shape: object({ columns: list(text(), { name: 'the columns', each: 'Column' }), rows: list(object({ label: text('the person'), cells: list(text(), { name: 'the forms', each: 'Form' }) }), { name: 'the rows', each: 'Row' }) }),
  format: value => table(value.columns, value.rows)
});
