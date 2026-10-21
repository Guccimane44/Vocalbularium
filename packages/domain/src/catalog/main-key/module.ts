import { defineInputModule } from '../define.js';
import { schemaOf } from '../shape.js';
import sample from './sample.json' with { type: 'json' };

export default defineInputModule({
  id: 'main-key', kind: 'input', label: 'Main key', description: 'The text you captured or typed. Every page has one.',
  instances: 'first-once', source: 'captured', sample, facets: []
});

// The run's reading of the main key (D08): word or phrase, or sentence. Its
// prompt is interpretation.prompt.md.
export const interpretationSchema = schemaOf({ inputType: { type: 'string', enum: ['word_phrase', 'sentence'] } });
