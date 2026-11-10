import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';
import examples from './facets/examples/facet.js';
import synonyms from './facets/synonyms/facet.js';
import antonyms from './facets/antonyms/facet.js';
import pronunciation from './facets/pronunciation/facet.js';
import etymology from './facets/etymology/facet.js';
import simpleTranslation from './facets/simple-translation/facet.js';
import grammarTeacher from './facets/grammar-teacher/facet.js';

// American spelling and vocabulary (module.prompt.md), checked against the
// common British spellings (english.ts). Built from English (British) and
// tailored (0.16.4). Not in the default deck.
export default defineContentModule({
  id: 'english-american', kind: 'content', label: 'English (American)',
  description: 'Explains a word in American English, or translates a sentence into American English.',
  instances: 'many',
  core, facets: [examples, synonyms, antonyms, pronunciation, etymology, simpleTranslation, grammarTeacher]
});
