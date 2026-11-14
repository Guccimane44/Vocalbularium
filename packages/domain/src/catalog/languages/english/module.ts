import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';
import examples from './facets/examples/facet.js';
import synonyms from './facets/synonyms/facet.js';
import antonyms from './facets/antonyms/facet.js';
import pronunciation from './facets/pronunciation/facet.js';
import etymology from './facets/etymology/facet.js';
import simpleTranslation from './facets/simple-translation/facet.js';
import grammarTeacher from './facets/grammar-teacher/facet.js';
import forms from './facets/forms/facet.js';

// English, British or American as the model writes it (D34): one module in
// place of English (British) and English (American), built from the American
// one. Not in the default deck.
export default defineContentModule({
  id: 'english', kind: 'content', label: 'English',
  description: 'Explains a word in English, or translates a sentence into English.',
  instances: 'many', source: 'generated', provider: 'text',
  core, facets: [examples, synonyms, antonyms, pronunciation, etymology, simpleTranslation, grammarTeacher, forms]
});
