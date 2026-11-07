import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';

// Creativity (D30): a classical haiku about the main key, in the key's own
// language. No facets in 0.16.4.
export default defineContentModule({
  id: 'traditional-haiku', kind: 'content', label: 'Traditional Haiku',
  description: 'Writes a classical haiku about the main key in its language.',
  instances: 'many', source: 'generated', provider: 'text',
  core, facets: []
});
