import { defineContentModule } from '../../define.js';
import core from './facets/core/facet.js';
import equation from './facets/equation/facet.js';

// Follows Mathematics and Computer Science (D11); its Equation facet and the
// core's `hasEquation` flag came with D30.
export default defineContentModule({
  id: 'chemistry', kind: 'content', label: 'Chemistry',
  description: 'Explains a term or concept as chemistry understands it.',
  instances: 'many', source: 'generated', provider: 'text',
  core, facets: [equation]
});
