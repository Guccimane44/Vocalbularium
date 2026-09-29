// Compatibility is limited to application field names. Text, deck names, IDs,
// generation output and draft dictionaries must remain byte-for-byte values.
const fields: Record<string, string> = {
  card: 'karte', cards: 'kartes', cardId: 'karteId', cardCount: 'karteCount',
  card_id: 'karte_id', card_count: 'karte_count', recentCards: 'recentKartes',
  pages: 'seites', pageId: 'seiteId', pageIds: 'seiteIds', pageCount: 'seiteCount',
  page_id: 'seite_id', page_count: 'seite_count', front_page_id: 'front_seite_id',
  basePageIds: 'baseSeiteIds', selectedPage: 'selectedSeite', selectedPageId: 'selectedSeiteId'
};
const legacyFields = Object.fromEntries(Object.entries(fields).map(([old, current]) => [current, old]));
const names: Record<string, string> = {
  'save-card': 'save-karte', 'create-card': 'create-karte', 'delete-card': 'delete-karte',
  'card-detail': 'karte-detail', 'deck-cards': 'deck-kartes', 'retry-page': 'retry-seite',
  'save-pages': 'save-seites', front_page: 'front_seite', manual_card: 'manual_karte'
};
const legacyNames = Object.fromEntries(Object.entries(names).map(([old, current]) => [current, old]));

export function currentPath(path: string): string {
  return path.replace(/^\/api\/cards(?=\/|$)/, '/api/kartes')
    .replace(/^\/api\/card(?=\/|$)/, '/api/karte')
    .replace(/^(\/api\/decks\/[^/?]+)\/cards(?=[/?]|$)/, '$1/kartes');
}
export function legacyPath(path: string): string {
  return path.replace(/^\/api\/kartes(?=\/|$)/, '/api/cards')
    .replace(/^\/api\/karte(?=\/|$)/, '/api/card')
    .replace(/^(\/api\/decks\/[^/?]+)\/kartes(?=[/?]|$)/, '$1/cards')
    .replace('/:karteId', '/:cardId');
}
export function currentHash(hash: string): string {
  return hash.replace(/^(#?)card(?=\/)/, '$1karte').replace(/^(#?)new-card(?=\/)/, '$1new-karte');
}

// Boundary values are untyped JSON from older builds and persisted receipts.
// Keeping the old fingerprint shape is permanent while those receipts exist.
function translate(value: any, legacy: boolean): any {
  if (Array.isArray(value)) return value.map(item => translate(item, legacy));
  if (!value || typeof value !== 'object') return value;
  const mapping = legacy ? legacyFields : fields;
  const result: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    const target = mapping[key] ?? key;
    if (target !== key && Object.hasOwn(value, target)) throw new Error('Do not mix legacy and current terminology fields.');
    if (key === 'base' || key === 'texts') result[target] = item; // keyed by user-independent IDs
    else if (typeof item === 'string' && (key === 'type' || key === 'code' || key === 'errorCode')) {
      result[target] = (legacy ? legacyNames : names)[item] ?? item;
    } else if (typeof item === 'string' && key === 'path') result[target] = legacy ? legacyPath(item) : currentPath(item);
    else if (typeof item === 'string' && key === 'route') result[target] = legacy
      ? item.replace(/^(#?)(new-)?karte(?=\/)/, '$1$2card') : currentHash(item);
    else result[target] = translate(item, legacy);
  }
  return result;
}
export function currentValue(value: any): any { return translate(value, false); }
export function legacyValue(value: any): any { return translate(value, true); }
export function legacyOperation(kind: string): string { return legacyNames[kind] ?? kind; }
export function usesCurrentFields(value: any): boolean {
  if (Array.isArray(value)) return value.some(usesCurrentFields);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => Object.hasOwn(legacyFields, key) ||
    (!['base', 'texts'].includes(key) && usesCurrentFields(item)));
}
