// @ts-check
/** @typedef {import('@vocabularium/contracts').PendingMutation} PendingMutation */
/** @typedef {import('@vocabularium/contracts').OperationId} OperationId */

// Durable receipts survive worker loss; only failed/interrupted work needs a recovery panel.
/** @param {{request:(path:string,payload:unknown,token:string)=>Promise<unknown>,storage?:LocalStorageArea}} options */
export function saveOperations({ request, storage = chrome.storage.local }) {
  /** @type {Map<OperationId, Promise<unknown>>} */
  const active = new Map();
  let recovery;
  function recover() {
    recovery ??= (async () => {
      const local = await storage.get(null);
      const interrupted = Object.fromEntries(Object.entries(local)
        .filter(([key, item]) => key.startsWith('save-') && typeof item === 'object' && item !== null && 'state' in item && item.state === 'saving')
        .map(([key, item]) => [key, { ...(/** @type {Record<string, unknown>} */ (item)), state: 'pending' }]));
      if (Object.keys(interrupted).length) await storage.set(interrupted);
    })().catch(/** @param {unknown} error */ error => { recovery = undefined; throw error; });
    return recovery;
  }
  /** @param {PendingMutation} receipt */
  async function recordPending(receipt) {
    await recover();
    if (!active.has(receipt.operationId)) await storage.set({ [`save-${receipt.operationId}`]: { ...receipt, state: 'pending' } });
  }
  /** @param {unknown} error */
  function errorCode(error) {
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  }
  /** @param {PendingMutation} receipt @param {string} token @param {string[]} [discardCodes] */
  function perform(receipt, token, discardCodes = []) {
    if (active.has(receipt.operationId)) return active.get(receipt.operationId);
    const key = `save-${receipt.operationId}`;
    const task = (async () => {
      await recover();
      await storage.set({ [key]: { ...receipt, state: 'saving' } });
      try {
        const result = await request(receipt.path, receipt.payload, token);
        await storage.remove(key);
        return result;
      } catch (error) {
        if (discardCodes.includes(errorCode(error) ?? '')) await storage.remove(key);
        else await storage.set({ [key]: { ...receipt, state: 'pending' } });
        throw error;
      }
    })().finally(() => active.delete(receipt.operationId));
    active.set(receipt.operationId, task);
    return task;
  }
  return { recover, recordPending, perform };
}
