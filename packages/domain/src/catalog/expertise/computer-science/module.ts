import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';
import code from './facets/code/facet.js';
import sample from './sample.json' with { type: 'json' };

// Provisional (D11); its first facet, Code example, came with D17.
export default defineContentModule({
  id: 'computer-science', kind: 'content', label: 'Computer Science',
  description: 'Explains a term or concept as computer science understands it.',
  instances: 'many', source: 'generated', sample, provider: 'text',
  core, facets: [code]
});
