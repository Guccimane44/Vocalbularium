import { showFeedback } from './feedback.js';

export function captureRuntime({ request, initialize, refresh, removeAccess }) {
  let polling;
  async function context() {
    const state = await initialize();
    if (!state.signedIn) throw new Error('Sign in to capture vocabulary.');
    const [{ auth }, { session }] = await Promise.all([chrome.storage.local.get('auth'), chrome.storage.session.get('session')]);
    return { auth, session };
  }
  async function recordError(error) {
    await chrome.storage.local.set({ connectionError: error.message });
    if (error.status === 401) await removeAccess();
  }
  async function submit(receipt) {
    const key = `capture-${receipt.operationId}`;
    try {
      const { auth, session } = await context();
      const result = await request('/api/capture', {
        operationId: receipt.operationId, payload: receipt.payload, recoverySession: session
      }, auth.token);
      await chrome.storage.local.set({ [key]: { ...receipt, state: 'saved', cardId: result.cardId, error: null } });
      await refresh();
      void poll().catch(recordError);
    } catch (error) {
      await chrome.storage.local.set({ [key]: { ...receipt, state: 'pending', error: error.message } });
      if (error.status === 401) await removeAccess();
      throw error;
    }
  }
  async function handleCapture(info, tab) {
    // Freeze the currently synchronized destination before any network work.
    const [{ auth, account }, { session }] = await Promise.all([
      chrome.storage.local.get(['auth', 'account']), chrome.storage.session.get('session')
    ]);
    const snapshot = account?.decks.find(deck => deck.id === account.defaultDeckId);
    if (!auth || !session || !snapshot || typeof info.selectionText !== 'string' || !info.selectionText.length) {
      await showFeedback(tab.id, 'Capture unavailable. Open Vocabularium to sign in.', true); return;
    }
    const operationId = crypto.randomUUID();
    const receipt = { operationId, payload: { session, snapshot, selectedText: info.selectionText }, state: 'saving', createdAt: new Date().toISOString() };
    try { await chrome.storage.local.set({ [`capture-${operationId}`]: receipt }); }
    catch { await showFeedback(tab.id, 'Capture could not be received.', true); return; }
    await showFeedback(tab.id, 'Capture received');
    await submit(receipt).catch(recordError);
    return operationId;
  }
  async function poll() {
    if (polling) return polling;
    polling = (async () => {
      const { auth, session } = await context();
      while (true) {
        const result = await request('/api/poll', { session }, auth.token);
        let failedSave = false;
        for (const attemptId of result.ready) {
          const operationId = `publish-${attemptId}`, key = `save-${operationId}`;
          if ((await chrome.storage.local.get(key))[key]) { failedSave = true; continue; }
          const pending = { operationId, path: '/api/publish', payload: { operationId, payload: { attemptId, session } } };
          await chrome.storage.local.set({ [key]: pending });
          try {
            await request(pending.path, pending.payload, auth.token);
            await chrome.storage.local.remove(key);
          } catch (error) { failedSave = true; await recordError(error); }
        }
        await refresh();
        if (!result.loading || failedSave) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    })();
    try { await polling; } finally { polling = undefined; }
  }
  async function reconcile(session) {
    const local = await chrome.storage.local.get(null);
    for (const [key, item] of Object.entries(local)) {
      if (key.startsWith('save-publish-') && item.payload.payload.session.sessionId !== session.sessionId) {
        await chrome.storage.local.remove(key);
      }
      if (key.startsWith('capture-') && item.state === 'saving') {
        await chrome.storage.local.set({ [key]: { ...item, state: 'pending', error: 'The save was interrupted. Try saving again.' } });
      }
    }
  }
  return { handleCapture, submit, poll, reconcile, recordError };
}
