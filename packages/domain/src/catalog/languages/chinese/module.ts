import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';
import examples from './facets/examples/facet.js';
import pinyin from './facets/pinyin/facet.js';
import pronunciation from './facets/pronunciation/facet.js';
import etymology from './facets/etymology/facet.js';
import simpleTranslation from './facets/simple-translation/facet.js';
import grammarTeacher from './facets/grammar-teacher/facet.js';

// Simplified characters (module.prompt.md).
export default defineContentModule({
  id: 'chinese', kind: 'content', label: 'Chinese',
  description: 'Explains a word in Chinese, or translates a sentence into Chinese.',
  instances: 'many', source: 'generated', provider: 'text',
  core, facets: [examples, pinyin, pronunciation, etymology, simpleTranslation, grammarTeacher]
});
