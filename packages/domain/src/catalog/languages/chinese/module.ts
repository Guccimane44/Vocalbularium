import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';
import examples from './facets/examples/facet.js';
import pinyin from './facets/pinyin/facet.js';
import sample from './sample.json' with { type: 'json' };

// Simplified characters (module.prompt.md).
export default defineContentModule({
  id: 'chinese', kind: 'content', label: 'Chinese',
  description: 'Explains a word in Chinese, or translates a sentence into Chinese.',
  instances: 'many', source: 'generated', sample, provider: 'text',
  core, facets: [examples, pinyin]
});
