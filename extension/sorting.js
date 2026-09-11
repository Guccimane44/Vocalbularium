export const SORT_ORDERS = [
  ['newest', 'Creation time, newest to oldest'], ['oldest', 'Creation time, oldest to newest'],
  ['az', 'Alphabetical, A to Z'], ['za', 'Alphabetical, Z to A']
];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function sortCards(cards, order = 'newest') {
  // Unicode normalization plus case folding, then code-unit order is identical on every installation.
  const key = text => text.normalize('NFKC').toLowerCase();
  return [...cards].sort((a, b) => {
    const primary = ['az', 'za'].includes(order)
      ? compare(key(a.pages[0]?.text ?? ''), key(b.pages[0]?.text ?? ''))
      : compare(a.created_at, b.created_at);
    return primary * (['newest', 'za'].includes(order) ? -1 : 1) || compare(a.id, b.id);
  });
}
