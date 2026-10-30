import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';

// The first module of the Sound family (D24): the page's main key, spoken in
// its own language. At most one per page, since a second would say the same.
export default defineContentModule({
  id: 'pronunciation', kind: 'content', label: 'Pronunciation',
  description: 'Speaks the main key in its own language.',
  instances: 'at-most-one', source: 'generated', provider: 'text',
  core, facets: []
});
