import { defineInputModule } from '../../define.js';

export default defineInputModule({
  id: 'text', kind: 'input', label: 'Text', description: 'Your own notes. Generation never changes them.',
  instances: 'many', source: 'user', facets: []
});
