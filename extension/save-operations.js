// Durable receipts survive worker loss; only failed/interrupted work needs a recovery panel.
export function saveOperations({ request, storage = chrome.storage.local }) {
  const active = new Map();
  let recovery;
  function recover() {
    recovery ??= (async () => {
      const local = await storage.get(null);
      const interrupted = Object.fromEntries(Object.entries(local)
        .filter(([key, item]) => key.startsWith('save-') && item.state === 'saving')
        .map(([key, item]) => [key, { ...item, state: 'pending' }]));
      if (Object.keys(interrupted).length) await storage.set(interrupted);
    })().catch(error => { recovery = undefined; throw error; });
    return recovery;
  }
  async function recordPending(receipt) {
    await recover();
    if (!active.has(receipt.operationId)) await storage.set({ [`save-${receipt.operationId}`]: { ...receipt, state: 'pending' } });
  }
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
        if (discardCodes.includes(error.code)) await storage.remove(key);
        else await storage.set({ [key]: { ...receipt, state: 'pending' } });
        throw error;
      }
    })().finally(() => active.delete(receipt.operationId));
    active.set(receipt.operationId, task);
    return task;
  }
  return { recover, recordPending, perform };
}
