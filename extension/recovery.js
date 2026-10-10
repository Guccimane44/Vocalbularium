// Storage written by this build. Version 2 is the deck → page → component model;
// version 3 has page-owned modules (D02).
export const DATA_VERSION = 3;

export async function readLocal(keys) {
  return chrome.storage.local.get(keys);
}

// Model upgrades discard earlier content (Q72 in 0.4.0, D02 in 0.5.0). Cached
// account data, unsent captures and pending saves from the old version are
// dropped once; sign-in, installation identity, theme and log settings stay.
export async function discardRetiredData(storage = chrome.storage.local) {
  const local = await storage.get(null);
  if (local.dataVersion === DATA_VERSION) return false;
  const retired = Object.keys(local).filter(key => key === 'account' || key === 'connectionError' ||
    key.startsWith('capture-') || key.startsWith('save-'));
  if (retired.length) await storage.remove(retired);
  await storage.set({ dataVersion: DATA_VERSION });
  return true;
}
