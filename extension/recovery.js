// @ts-check
/** @import { LocalItems } from '../types/extension.js' */

// Storage written by this build. Version 2 is the deck → page → component model;
// version 3 has page-owned modules (D02); version 4 has one request per module
// and a card's own reading of the main key (D17).
export const DATA_VERSION = 4;

// The items as this build writes them.
/** @param {string | string[] | null} keys @returns {Promise<LocalItems>} */
export async function readLocal(keys) {
  return /** @type {Promise<LocalItems>} */ (chrome.storage.local.get(keys));
}

// Model upgrades discard earlier content (Q72 in 0.4.0, D02 in 0.5.0, D17 in 0.12.0). Cached
// account data, unsent captures and pending saves from the old version are
// dropped once; sign-in, installation identity, theme and log settings stay.
/** @param {LocalStorageArea} [storage] */
export async function discardRetiredData(storage = chrome.storage.local) {
  const local = await storage.get(null);
  if (local.dataVersion === DATA_VERSION) return false;
  const retired = Object.keys(local).filter(key => key === 'account' || key === 'connectionError' ||
    key.startsWith('capture-') || key.startsWith('save-'));
  if (retired.length) await storage.remove(retired);
  await storage.set({ dataVersion: DATA_VERSION });
  return true;
}
