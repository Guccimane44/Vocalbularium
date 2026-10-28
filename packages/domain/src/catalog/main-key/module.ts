import { defineInputModule } from '../define.js';
import sample from './sample.json' with { type: 'json' };

export default defineInputModule({
  id: 'main-key', kind: 'input', label: 'Main key', description: 'The text you captured or typed. Every page has one.',
  instances: 'first-once', source: 'captured', sample, facets: []
});

