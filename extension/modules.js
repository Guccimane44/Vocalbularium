export const MODULES = Object.freeze({
  selected: { label: '<The selected>', applies: 'any', interpretation: false },
  'selected-language': { label: '<The selected + original language tag>', applies: 'any', interpretation: true },
  'german-explanation': { label: '<German explanation>', applies: 'word_phrase', interpretation: true },
  'german-examples': { label: '<German explanation + examples>', applies: 'word_phrase', interpretation: true },
  'sentence-usage': { label: '<Sentence usage>', applies: 'sentence', interpretation: true }
});
