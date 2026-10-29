import { defineInputModule } from '../../define.js';

export default defineInputModule({
  id: 'context', kind: 'input', label: 'Context', description: 'The text around your selection, used to find the right meaning.',
  instances: 'at-most-one', source: 'captured', facets: []
});
