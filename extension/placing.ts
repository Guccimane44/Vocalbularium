// How many counted entries come before `before` in `ids`, or null when there
// is no such entry and the place is the end. Entries in `skip` are not
// counted: a card still shown while it is being deleted may already be gone
// on the server, and a card being moved leaves its old place.
export function countedBefore(ids: readonly string[], before: string | null, skip: ReadonlySet<string> = new Set()): number | null {
  const at = before === null ? -1 : ids.indexOf(before);
  if (at < 0) return null;
  return ids.slice(0, at).filter(id => !skip.has(id)).length;
}
