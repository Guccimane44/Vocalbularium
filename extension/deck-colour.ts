import type { DeckColour } from '@vocabularium/contracts';
import { DECK_COLOURS } from '@vocabularium/domain/page-modules';

// A deck's colour is one of the six earlier family colours (D05, D06). The user chooses it in
// deck settings (D06); until then it is derived from the deck's ID, so every
// view and installation shows the same colour.
export function deckColour(deck: { id?: string; colour?: string | null }): DeckColour {
  if (deck.colour && (DECK_COLOURS as readonly string[]).includes(deck.colour)) return deck.colour as DeckColour;
  let hash = 0;
  for (const char of String(deck.id ?? '')) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return DECK_COLOURS[hash % DECK_COLOURS.length]!;
}
