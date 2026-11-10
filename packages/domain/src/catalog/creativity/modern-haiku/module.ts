import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';

// Creativity (D30): a free modern haiku about the main key, in the key's own
// language. No facets in 0.16.4.
export default defineContentModule({
  id: 'modern-haiku', kind: 'content', label: 'Modern Haiku',
  description: 'Writes a free modern haiku about the main key in its language.',
  instances: 'many',
  core, facets: []
});
