import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';
import formula from './facets/formula/facet.js';
import sample from './sample.json' with { type: 'json' };

// Provisional (D11); its first facet, Formula, came with D17.
export default defineContentModule({
  id: 'mathematics', kind: 'content', label: 'Mathematics',
  description: 'Explains a term or concept as mathematics understands it.',
  instances: 'many', source: 'generated', sample, provider: 'text',
  core, facets: [formula]
});
