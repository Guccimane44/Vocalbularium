import { codeBlock, defineFacet, object, requireTool, text } from '../../../../blocks.js';

// One short, commented Python example of the concept as a fenced code block
// (D17; Python since 0.13.1, D21, its ID still `code` so existing cards keep it).
// Only for a key of the subject usually shown in code.
export default defineFacet({
  id: 'code', label: 'Python', abbreviation: 'Py', description: 'A short, commented Python example of a computer science concept.',
  applies: ['word_phrase', 'sentence'], output: 'text',
  when: core => core.relevance === 'subject' && core.hasCode === 'yes',
  shape: object({ language: text('the language'), code: text('the code') }),
  format: value => codeBlock(value.language.toLowerCase(), value.code),
  checks: [{
    id: 'python', description: 'The example is Python and parses.',
    test: async (value, _card, tools) => value.language.trim().toLowerCase() !== 'python' ? `the language is "${value.language}", not Python`
      : await requireTool(tools, 'pythonParses')(value.code) ? null : 'the code does not parse as Python'
  }]
});
