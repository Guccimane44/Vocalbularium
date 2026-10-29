import { defineInputModule } from '../define.js';

export default defineInputModule({
  id: 'main-key', kind: 'input', label: 'Main key', description: 'The text you captured or typed. Every page has one.',
  instances: 'first-once', source: 'captured', facets: []
});

