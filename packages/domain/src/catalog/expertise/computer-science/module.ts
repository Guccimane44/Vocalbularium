import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';
import code from './facets/code/facet.js';

// Provisional (D11); its first facet came with D17 as Code example, Python since 0.13.1 (D21).
export default defineContentModule({
  id: 'computer-science', kind: 'content', label: 'Computer Science',
  description: 'Explains a term or concept as computer science understands it.',
  instances: 'many', source: 'generated', provider: 'text',
  core, facets: [code]
});
