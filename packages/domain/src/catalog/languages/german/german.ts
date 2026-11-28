import type { CoreValue } from '../../define.js';

// Whether the selection is German: the core names its language Deutsch. The
// grammar facets describe the selection, so they apply only then.
export const isGermanSelection = (core: CoreValue): boolean => String(core.language ?? '').trim().toLowerCase() === 'deutsch';
// Whether the core reads the selection as a German word of this part of speech.
export const isGermanRole = (core: CoreValue, ...roles: string[]): boolean =>
  isGermanSelection(core) && roles.includes(String(core.gramRole ?? '').toLowerCase());
