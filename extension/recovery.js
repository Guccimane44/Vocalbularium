// Storage written by this build. Version 2 is the deck → page → component model.
export const DATA_VERSION = 2;

export async function readLocal(keys) {
  return chrome.storage.local.get(keys);
}

// The page/component upgrade discards 0.3.0+ content (Q72). Cached account
// data, unsent captures and pending saves from the old version are dropped
// once; sign-in, installation identity, theme and log settings stay.
export async function discardRetiredData(storage = chrome.storage.local) {
  const local = await storage.get(null);
  if (local.dataVersion === DATA_VERSION) return false;
  const retired = Object.keys(local).filter(key => key === 'account' || key === 'connectionError' ||
    key.startsWith('capture-') || key.startsWith('save-'));
  if (retired.length) await storage.remove(retired);
  await storage.set({ dataVersion: DATA_VERSION });
  return true;
}
