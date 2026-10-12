import { FAMILIES } from '@vocabularium/domain/page-modules';
import type { ModuleFamily } from '@vocabularium/domain/page-modules';

// A deck's colour is one of the family colours (D05). The user chooses it in
// deck settings (D06); until then it is derived from the deck's ID, so every
// view and installation shows the same colour.
export function deckColour(deck: { id?: string; colour?: string | null }): ModuleFamily {
  if (deck.colour && (FAMILIES as readonly string[]).includes(deck.colour)) return deck.colour as ModuleFamily;
  let hash = 0;
  for (const char of String(deck.id ?? '')) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return FAMILIES[hash % FAMILIES.length]!;
}
