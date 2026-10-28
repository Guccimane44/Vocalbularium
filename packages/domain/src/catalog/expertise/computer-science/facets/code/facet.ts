import { codeBlock, defineFacet, object, text } from '../../../../blocks.js';

// One short, commented example of the concept as a fenced code block in its
// language (D17). Only for a key of the subject usually shown in code.
export default defineFacet({
  id: 'code', label: 'Code example', abbreviation: 'Cd', description: 'A short, commented code example of a computer science concept.',
  applies: ['word_phrase', 'sentence'], output: 'text',
  when: core => core.relevance === 'subject' && core.hasCode === 'yes',
  shape: object({ language: text('the language'), code: text('the code') }),
  format: value => codeBlock(value.language.toLowerCase(), value.code)
});
