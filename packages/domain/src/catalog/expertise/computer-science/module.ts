import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';
import sample from './sample.json' with { type: 'json' };

// Provisional (D11): a core only, in English; facets follow later.
export default defineContentModule({
  id: 'computer-science', kind: 'content', label: 'Computer Science',
  description: 'Explains a term or concept as computer science understands it.',
  instances: 'many', source: 'generated', sample, provider: 'text',
  core, facets: []
});
