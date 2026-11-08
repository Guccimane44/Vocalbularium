import { defineFamily } from '../define.js';

// Parents that write something new from the key (D30): a haiku or a joke, in
// the key's own language rather than the interface language (D15 does not
// apply). Its top line keeps the language it writes in and the key.
export default defineFamily({ id: 'creativity', label: 'Creativity', folder: 'creativity' });
