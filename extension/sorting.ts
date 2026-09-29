export const SORT_ORDERS = [
  ['newest', 'Creation time, newest to oldest'], ['oldest', 'Creation time, oldest to newest'],
  ['az', 'Alphabetical, A to Z'], ['za', 'Alphabetical, Z to A']
];
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function sortKartes<T extends { id: string; created_at: string; pages: Array<{ text: string }> }>(kartes: T[], order = 'newest'): T[] {
  // Unicode normalization plus case folding, then code-unit order is identical on every installation.
  const key = (text: string) => text.normalize('NFKC').toLowerCase();
  return [...kartes].sort((a, b) => {
    const primary = ['az', 'za'].includes(order)
      ? compare(key(a.pages[0]?.text ?? ''), key(b.pages[0]?.text ?? ''))
      : compare(a.created_at, b.created_at);
    return primary * (['newest', 'za'].includes(order) ? -1 : 1) || compare(a.id, b.id);
  });
}
