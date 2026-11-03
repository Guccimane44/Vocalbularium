// @ts-check
import { readLocal } from './recovery.js';
import { showFeedback } from './feedback.js';
import { captureContext } from './context-extraction.js';
import { t } from './i18n.ts';
/** @import { BrowserSession, DeckConfigurationSnapshot, PendingMutation } from '@vocabularium/contracts' */
/** @import { AccessState, CaptureReceipt } from '../types/extension.js' */
/** @import { saveOperations } from './save-operations.js' */
// A failed request, as the worker's `request` throws it.
/** @typedef {Error & { status?: number, code?: string }} RequestError */
// The account server's replies the captures read; the contracts describe requests only.
/** @typedef {{ snapshot: DeckConfigurationSnapshot }} PreparedCapture */
/** @typedef {{ pageId: string }} SavedCapture */
/** @typedef {{ ready: string[], saveFailed?: string[], loading: boolean }} PollResult */
/** @typedef {{
  request: (path: string, body: unknown, token?: string) => Promise<unknown>,
  initialize: () => Promise<AccessState>,
  refresh: (savedCapture?: CaptureReceipt) => Promise<AccessState>,
  removeAccess: () => Promise<void>,
  saves: ReturnType<typeof saveOperations>,
  diagnostic?: (event: Record<string, unknown>) => void,
  extractContext?: typeof captureContext,
  accepted?: () => Promise<void>
}} CaptureDependencies */

/** @param {CaptureDependencies} dependencies */
export function captureRuntime({ request, initialize, refresh, removeAccess, saves, diagnostic = () => {}, extractContext = captureContext, accepted = async () => {} }) {
  /** @type {Promise<void> | undefined} */
  let polling;
  let pollAgain = false;
  async function context() {
    const state = await initialize();
    if (!state.signedIn) throw new Error(t('capture.signIn'));
    const [{ auth }, { session }] = await Promise.all([readLocal('auth'), chrome.storage.session.get('session')]);
    // Signed in: the worker keeps its sign-in and its browser session.
    return { auth: /** @type {NonNullable<typeof auth>} */ (auth), session: /** @type {BrowserSession} */ (session) };
  }
  /** @param {unknown} caught */
  async function recordError(caught) {
    const error = /** @type {RequestError} */ (caught);
    await chrome.storage.local.set({ connectionError: error.message });
    if (error.status === 401) await removeAccess();
  }
  /** @param {CaptureReceipt} receipt */
  async function submit(receipt) {
    const key = `capture-${receipt.operationId}`;
    try {
      const { auth, session } = await context();
      if (!receipt.prepared) {
        try {
          const prepared = /** @type {PreparedCapture} */ (await request('/api/capture/prepare', {
            operationId: `prepare-${receipt.operationId}`,
            payload: { session: receipt.payload.session, mainKey: receipt.payload.mainKey }
          }, auth.token));
          receipt = { ...receipt, prepared: true, payload: { ...receipt.payload, snapshot: prepared.snapshot } };
          await chrome.storage.local.set({ [key]: receipt });
        } catch (caught) {
          const error = /** @type {RequestError} */ (caught);
          // A capture first recovered after browser exit keeps its invocation snapshot and records failure.
          if (error.code !== 'stale_session' || session.sessionId === receipt.payload.session.sessionId) throw error;
        }
      }
      const result = /** @type {SavedCapture} */ (await request('/api/capture', {
        operationId: receipt.operationId, payload: receipt.payload, recoverySession: session
      }, auth.token));
      try { await accepted(); } catch { /* The toolbar badge never fails a capture. */ }
      await refresh({ ...receipt, state: 'saved', pageId: result.pageId, error: null });
      void poll().catch(recordError);
    } catch (caught) {
      const error = /** @type {RequestError} */ (caught);
      await chrome.storage.local.set({ [key]: { ...receipt, state: 'pending', error: error.message } });
      if (error.status === 401) await removeAccess();
      throw error;
    }
  }
  // A selection's click comes with the tab it was made in.
  /** @param {ChromeMenuClick} info @param {ChromeTab} tab */
  async function handleCapture(info, tab) {
    // Keep an offline receipt immediately; the first server acceptance freezes the shared configuration.
    const [{ auth, account }, { session: stored }] = await Promise.all([
      readLocal(['auth', 'account']), chrome.storage.session.get('session')
    ]);
    const session = /** @type {BrowserSession | undefined} */ (stored);
    // A deck from the list has no modules; the stored account has its default deck's.
    const deck = /** @type {{ id: string, modules: DeckConfigurationSnapshot['modules'] } | undefined} */ (account?.defaultDeckSnapshot ?? account?.decks.find(deck => deck.id === account.defaultDeckId));
    const snapshot = deck && { id: deck.id, modules: deck.modules };
    if (!auth || !session || !snapshot || typeof info.selectionText !== 'string' || !info.selectionText.length) {
      await showFeedback(/** @type {number} */ (tab.id), t('capture.unavailable'), true, info.pageUrl ?? tab.url); return;
    }
    const operationId = crypto.randomUUID();
    // A deck with the Context module captures the surrounding block; otherwise nothing beyond the selection is read.
    const context = deck.modules?.some(module => module.type === 'context') ? await extractContext(/** @type {ChromeMenuClick & { selectionText: string }} */ (info), tab) : undefined;
    try { diagnostic({ event: 'capture.invoked', operationId, installationId: session.installationId, sessionId: session.sessionId,
      outcome: 'started', content: { selectedText: info.selectionText, ...(context ? { context } : {}) } }); } catch { /* Capture remains independent of logging. */ }
    /** @type {CaptureReceipt['payload']} */
    const payload = { session, snapshot, mainKey: info.selectionText, ...(context ? { context } : {}) };
    /** @type {CaptureReceipt} */
    const receipt = { operationId, payload, state: 'saving', createdAt: new Date().toISOString() };
    try { await chrome.storage.local.set({ [`capture-${operationId}`]: receipt }); }
    catch { await showFeedback(/** @type {number} */ (tab.id), t('capture.notReceived'), true, info.pageUrl ?? tab.url); return; }
    await showFeedback(/** @type {number} */ (tab.id), t('capture.received'), false, info.pageUrl ?? tab.url, info.selectionText);
    await submit(receipt).catch(recordError);
    return operationId;
  }
  async function poll() {
    // A capture can be accepted while an older poll is about to observe no
    // loading attempts. Keep its wakeup instead of returning the older poll.
    if (polling) { pollAgain = true; return polling; }
    polling = (async () => {
      do {
        pollAgain = false;
        const { auth, session } = await context();
        while (true) {
          const result = /** @type {PollResult} */ (await request('/api/poll', { session }, auth.token));
          let failedSave = false;
          for (const attemptId of result.saveFailed ?? []) {
            const operationId = `publish-${attemptId}`;
            /** @type {PendingMutation} */
            const pending = { operationId, path: '/api/publish', payload: { operationId, payload: { attemptId, session } } };
            await saves.recordPending(pending);
            failedSave = true;
          }
          for (const attemptId of result.ready) {
            const operationId = `publish-${attemptId}`, key = `save-${operationId}`;
            if ((await readLocal(key))[key]) { failedSave = true; continue; }
            /** @type {PendingMutation} */
            const pending = { operationId, path: '/api/publish', payload: { operationId, payload: { attemptId, session } } };
            try {
              await saves.perform(pending, auth.token);
            } catch (error) { failedSave = true; await recordError(error); }
          }
          await refresh();
          if (!result.loading || failedSave) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } while (pollAgain);
    })();
    try { await polling; } finally {
      polling = undefined;
      if (pollAgain) { pollAgain = false; void poll().catch(recordError); }
    }
  }
  /** @param {BrowserSession} session */
  async function reconcile(session) {
    const local = await readLocal(null);
    for (const [key, value] of Object.entries(local)) {
      // Keyed by kind: a save's pending mutation, or a capture's receipt.
      const item = /** @type {PendingMutation & CaptureReceipt & { payload: { payload: { session: BrowserSession } } }} */ (value);
      if (key.startsWith('save-publish-') && item.payload.payload.session.sessionId !== session.sessionId) {
        await chrome.storage.local.remove(key);
      }
      if (key.startsWith('capture-') && item.state === 'saving') {
        await chrome.storage.local.set({ [key]: { ...item, state: 'pending', error: t('save.interrupted') } });
      }
    }
  }
  return { handleCapture, submit, poll, reconcile, recordError };
}
