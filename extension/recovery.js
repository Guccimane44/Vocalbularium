import { currentValue } from '@vocabularium/contracts';

// Decode at the recovery boundary; the next successful write stores current
// fields. Never change operation IDs or rewrite user text/draft dictionaries.
export async function readLocal(keys) {
  const values = await chrome.storage.local.get(keys);
  return Object.fromEntries(Object.entries(values).map(([key, item]) => [key, currentValue(item)]));
}
