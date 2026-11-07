import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';

// Creativity (D30): a short, clean joke about the main key, in the key's own
// language. No facets in 0.16.4.
export default defineContentModule({
  id: 'joke', kind: 'content', label: 'Joke',
  description: 'Tells a short joke about the main key in its language.',
  instances: 'many', source: 'generated', provider: 'text',
  core, facets: []
});
