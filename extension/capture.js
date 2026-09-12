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
      if (!receipt.prepared) {
        try {
          const prepared = await request('/api/capture/prepare', {
            operationId: `prepare-${receipt.operationId}`,
            payload: { session: receipt.payload.session, selectedText: receipt.payload.selectedText }
          }, auth.token);
          receipt = { ...receipt, prepared: true, payload: { ...receipt.payload, snapshot: prepared.snapshot } };
          await chrome.storage.local.set({ [key]: receipt });
        } catch (error) {
          // A capture first recovered after browser exit keeps its invocation snapshot and records failure.
          if (error.code !== 'stale_session' || session.sessionId === receipt.payload.session.sessionId) throw error;
        }
      }
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
    // Keep an offline receipt immediately; the first server acceptance freezes the shared configuration.
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
        for (const attemptId of result.saveFailed ?? []) {
          const operationId = `publish-${attemptId}`;
          const pending = { operationId, path: '/api/publish', payload: { operationId, payload: { attemptId, session } } };
          await chrome.storage.local.set({ [`save-${operationId}`]: pending });
          failedSave = true;
        }
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
