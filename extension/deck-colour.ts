import { FAMILIES } from '@vocabularium/domain/page-modules';

// A deck's colour is one of the family colours, derived from its ID so every
// view and installation shows the same colour without a stored setting (D05).
export function deckColour(id: string): string {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return FAMILIES[hash % FAMILIES.length]!;
}
