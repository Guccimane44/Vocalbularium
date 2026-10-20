import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';
import article from './facets/article/facet.js';
import examples from './facets/examples/facet.js';
import synonyms from './facets/synonyms/facet.js';
import antonyms from './facets/antonyms/facet.js';
import sample from './sample.json' with { type: 'json' };

export default defineContentModule({
  id: 'german', kind: 'content', label: 'German',
  description: 'Explains a word in German, or translates a sentence into German.',
  instances: 'many', source: 'generated', sample, provider: 'text',
  core, facets: [article, examples, synonyms, antonyms]
});
