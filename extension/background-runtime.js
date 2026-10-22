// @ts-check
import { discardRetiredData, readLocal } from './recovery.js';
import { saveOperations } from './save-operations.js';
import { API_URL } from './config.js';
import { captureRuntime } from './capture.js';
import { captureMenu } from './context-menu.js';
import { captureBadge } from './badge.js';
import { relayFeedbackTheme } from './feedback.js';
import { isApiFailure } from './api-failure.js';
import { extensionDiagnostics } from './diagnostics.js';
import { initializeLanguage, onLanguageChange, setLanguage, t } from './i18n.ts';
/** @import { AccessState, CaptureReceipt, RuntimeMessage, SessionItems, StoredAccount } from '../types/extension.js' */

export function startBackground() {
  // The worker's texts (the capture menu, feedback, errors) follow the account's language (D14);
  // the toolbar button's title too, which the manifest gives in English.
  onLanguageChange(() => { void chrome.action.setTitle({ title: t('worker.openTitle') }).catch(() => {}); });
  void initializeLanguage();
  const diagnostics = extensionDiagnostics({ upload: async events => {
    const { auth } = await readLocal('auth');
    if (!auth) throw new Error(t('worker.collectionSignIn'));
    const response = await fetch(API_URL + '/api/diagnostics/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ events }), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(t('worker.collectionUnavailable'));
    return response.json();
  } });
  diagnostics.record({ event: 'worker.started', outcome: 'succeeded' });
  globalThis.addEventListener?.('unhandledrejection', event => diagnostics.record({ event: 'worker.failed', severity: 'error', outcome: 'failed', errorType: event.reason?.name }));
  globalThis.addEventListener?.('error', event => diagnostics.record({ event: 'worker.failed', severity: 'error', outcome: 'failed', errorType: event.error?.name }));
  void chrome.alarms.create('diagnostics', { periodInMinutes: 0.5 });
  /** @type {Promise<AccessState> | undefined} */
  let initialization;
  let accessVersion = 0, sessionReady = false;
  let writes = /** @type {Promise<unknown>} */ (Promise.resolve()), refreshes = /** @type {Promise<unknown>} */ (Promise.resolve());
  const updateCaptureMenu = captureMenu();
  const saves = saveOperations({ request });
  const badge = captureBadge();
  void badge.restore().catch(() => {});
  /** @template T @param {() => Promise<T>} action */
  function writeState(action) {
    const next = writes.then(action); writes = next.catch(() => {}); return next;
  }
  /** @param {CaptureReceipt} [savedCapture] @returns {Promise<AccessState>} */
  function refreshAccount(savedCapture) {
    const version = accessVersion;
    const next = refreshes.then(async () => {
      if (version !== accessVersion) return { signedIn: false };
      const { auth } = await readLocal('auth');
      if (!auth) return { signedIn: false };
      /** @type {StoredAccount} */
      let account;
      try {
        const summary = await request('/api/account/summary', null, auth.token);
        const recent = await request('/api/captures/recent', null, auth.token);
        account = { ...summary, recentPages: recent.pages };
      }
      catch (/** @type {any} */ error) {
        if (version !== accessVersion) return { signedIn: false };
        if (error.status === 401) { await removeAccess(); return { signedIn: false }; }
        throw error;
      }
      const result = await writeState(async () => {
        if (version !== accessVersion) return { signedIn: false };
        // Replace the local capture receipt and its account snapshot together.
        await chrome.storage.local.set({ account, ...(savedCapture ? { [`capture-${savedCapture.operationId}`]: savedCapture } : {}) });
        await updateCaptureMenu(sessionReady ? account : null);
        return version === accessVersion ? { signedIn: true, account } : { signedIn: false };
      });
      if (result.signedIn) await clearHandedOffCaptures(account, auth.token, version);
      return result;
    });
    refreshes = next.catch(() => {}); return next;
  }
  /** @param {StoredAccount} account @param {string} token @param {number} version */
  async function clearHandedOffCaptures(account, token, version) {
    const local = await readLocal(null);
    const recentIds = new Set(account.recentPages.map(page => page.id));
    /** @type {[`capture-${string}`, string][]} */
    const confirmed = [];
    let detailChecks = 0;
    // Only the capture receipts are read; the key says which entries they are.
    for (const [key, receipt] of /** @type {[`capture-${string}`, CaptureReceipt | undefined][]} */ (Object.entries(local))) {
      if (!key.startsWith('capture-') || receipt?.state !== 'saved' || !receipt.pageId) continue;
      if (recentIds.has(receipt.pageId)) { confirmed.push([key, receipt.pageId]); continue; }
      if (detailChecks++ >= 10) continue;
      try {
        const page = await request(`/api/pages/${encodeURIComponent(receipt.pageId)}`, null, token);
        if (page.id === receipt.pageId) confirmed.push([key, receipt.pageId]);
      } catch { /* Keep the receipt until handoff can be confirmed. */ }
    }
    if (confirmed.length) await writeState(async () => {
      if (version !== accessVersion) return;
      const current = await readLocal(confirmed.map(([key]) => key));
      const removable = confirmed.filter(([key, pageId]) => current[key]?.state === 'saved' && current[key].pageId === pageId).map(([key]) => key);
      if (removable.length) await chrome.storage.local.remove(removable);
    });
  }
  // The account server's JSON reply. Its routes declare no response types.
  /** @param {string} path @param {any} [body] @param {string} [token] @returns {Promise<any>} */
  async function request(path, body, token) {
    const started = performance.now();
    const diagnosticRoute = path.startsWith('/api/diagnostics/');
    const meaningful = !diagnosticRoute && path !== '/api/poll' && !['/api/account/summary', '/api/captures/recent'].includes(path);
    const metadata = { operationId: body?.operationId, pageId: body?.payload?.pageId,
      componentId: body?.payload?.target?.componentId, attemptId: body?.payload?.attemptId, method: body ? 'POST' : 'GET', route: path.split('?')[0] };
    diagnostics.addSecret(token);
    if (meaningful) diagnostics.record({ ...metadata, event: 'request.started', outcome: 'started' });
    let response, result;
    try {
      response = await fetch(API_URL + path, {
        method: body ? 'POST' : 'GET',
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body && JSON.stringify(body), signal: AbortSignal.timeout(10000)
      });
      result = await response.json();
      if (!result || typeof result !== 'object') throw new Error();
    } catch (/** @type {any} */ error) {
      if (!diagnosticRoute) diagnostics.record({ ...metadata, event: 'request.failed', outcome: 'failed', severity: 'error',
        category: error.name === 'TimeoutError' ? 'timeout' : error instanceof SyntaxError ? 'invalid_response' : 'transport',
        durationMs: Math.round(performance.now() - started) });
      throw new Error(t('worker.serverUnavailable'));
    }
    diagnostics.addSecret(result.token);
    if (meaningful || (!diagnosticRoute && !response.ok)) diagnostics.record({ ...metadata,
      event: response.ok ? 'request.completed' : 'request.failed', requestId: response.headers?.get('x-request-id'),
      pageId: result.pageId ?? metadata.pageId, status: response.status,
      errorCode: result.code, outcome: response.ok ? result.replayed ? 'replayed' : 'succeeded' : 'failed',
      severity: response.ok ? 'info' : 'warn', durationMs: Math.round(performance.now() - started) });
    if (!response.ok) {
      const failure = isApiFailure(result) ? result : { error: t('worker.serverRejected'), code: 'server_error' };
      throw Object.assign(new Error(failure.error), { code: failure.code, status: response.status, details: failure.details });
    }
    return result;
  }

  async function removeAccess() {
    const version = ++accessVersion;
    initialization = undefined; sessionReady = false;
    await writeState(async () => {
      if (version !== accessVersion) return;
      await chrome.storage.local.remove(['auth', 'account']);
      await updateCaptureMenu(null);
    });
  }

  async function initialize() {
    await discardRetiredData();
    await saves.recover();
    if (initialization) return initialization;
    const version = accessVersion;
    const pending = (async () => {
      await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      const { auth } = await readLocal('auth');
      if (!auth) {
        await writeState(async () => { if (version === accessVersion) await updateCaptureMenu(null); });
        return { signedIn: false };
      }
      let { session } = /** @type {SessionItems} */ (await chrome.storage.session.get('session'));
      if (!session) {
        const local = await readLocal(['installationId', 'epoch']);
        session = { installationId: local.installationId ?? crypto.randomUUID(), epoch: (local.epoch ?? 0) + 1, sessionId: crypto.randomUUID() };
        await chrome.storage.local.set({ installationId: session.installationId, epoch: session.epoch });
        await chrome.storage.session.set({ session });
      }
      await request('/api/session', { operationId: `session-${session.sessionId}`, session }, auth.token);
      if (version !== accessVersion) return { signedIn: false };
      await captures.reconcile(session);
      if (version !== accessVersion) return { signedIn: false };
      sessionReady = true;
      const state = await refreshAccount();
      if (version === accessVersion) await chrome.alarms.create('recover', { periodInMinutes: 0.5 });
      return state;
    })();
    initialization = pending;
    try { return await pending; }
    catch (/** @type {any} */ error) {
      if (initialization === pending) initialization = undefined;
      if (error.status === 401 && version === accessVersion) await removeAccess();
      throw error;
    }
  }

  /** @param {RuntimeMessage} message @returns {Promise<any>} */
  async function run(message) {
    if (message.type === 'diagnostics-status') {
      const local = await diagnostics.status(), { auth } = await readLocal('auth');
      try { return { local, backend: auth ? await request('/api/diagnostics/status', null, auth.token) : null }; }
      catch { return { local, backend: null }; }
    }
    if (message.type === 'diagnostics-configure') return diagnostics.configure({ budgetBytes: message.budgetBytes });
    if (message.type === 'diagnostics-cleanup') {
      const { auth } = await readLocal('auth');
      if (!auth) throw new Error(t('worker.logsSignIn'));
      const backend = await request('/api/diagnostics/cleanup', { ...message.range, preview: message.preview === true }, auth.token);
      if (message.preview) return { backend };
      return { backend, local: await diagnostics.cleanup(backend.range) };
    }
    if (message.type === 'diagnostics-local-cleanup') return { local: await diagnostics.cleanup(message.range) };
    if (message.type === 'diagnostics-flush') { await diagnostics.flush(); return { local: await diagnostics.status() }; }
    await discardRetiredData();
    await saves.recover();
    if (message.type === 'login') {
      const version = ++accessVersion;
      initialization = undefined; sessionReady = false;
      const auth = await request('/api/login', { username: message.username, password: message.password });
      await writeState(async () => { if (version === accessVersion) { await chrome.storage.local.set({ auth }); await updateCaptureMenu(null); } });
      if (version !== accessVersion) return { signedIn: false };
      return initialize();
    }
    if (message.type === 'logout') {
      const { auth } = await readLocal('auth');
      if (auth) {
        try { await request('/api/logout', {}, auth.token); }
        catch (/** @type {any} */ error) { if (error.status !== 401) throw error; }
      }
      await removeAccess();
      return { signedIn: false };
    }
    if (message.type === 'dashboard-seen') { await badge.seen(); return {}; }
    if (message.type === 'initialize') {
      const initialized = await initialize();
      if (initialized.signedIn) void captures.poll().catch(captures.recordError);
      return initialized.signedIn ? run({ type: 'refresh' }) : initialized;
    }
    const version = accessVersion;
    const { auth } = await readLocal('auth');
    if (!auth) {
      if (message.type === 'refresh') return { signedIn: false };
      throw Object.assign(new Error(t('worker.signIn')), { code: 'unauthorized' });
    }
    /** @param {unknown} [saved] @returns {Promise<any>} */
    async function refreshAfterMutation(saved) {
      const state = await run({ type: 'refresh' });
      if (!state.signedIn) throw Object.assign(new Error(t('worker.signInToConfirm')), { code: 'unauthorized' });
      return saved === undefined ? state : { ...state, saved };
    }
    try {
      if (message.type === 'refresh') return sessionReady ? refreshAccount() : initialize();
      if (message.type === 'deck-detail') return request(`/api/decks/${encodeURIComponent(message.deckId)}`, null, auth.token);
      if (message.type === 'page-detail') return request(`/api/pages/${encodeURIComponent(message.pageId)}`, null, auth.token);
      if (message.type === 'deck-page') return request(`/api/decks?cursor=${encodeURIComponent(message.cursor)}`, null, auth.token);
      if (message.type === 'deck-pages') {
        const query = new URLSearchParams({ order: message.order ?? 'newest', limit: String(message.limit ?? 30) });
        if (message.cursor) query.set('cursor', message.cursor);
        return request(`/api/decks/${encodeURIComponent(message.deckId)}/pages?${query}`, null, auth.token);
      }
      if (message.type === 'set-default') {
        const operationId = message.operationId ?? crypto.randomUUID();
        const pending = { operationId, path: '/api/default-deck', payload: { operationId, deckId: message.deckId } };
        await saves.perform(pending, auth.token);
        return refreshAfterMutation();
      }
      if (message.type === 'set-language') {
        const operationId = message.operationId ?? crypto.randomUUID();
        await saves.perform({ operationId, path: '/api/language', payload: { operationId, language: message.language } }, auth.token, ['invalid']);
        // The worker's own texts, such as the capture menu, change before the refresh redraws them.
        setLanguage(message.language);
        return refreshAfterMutation();
      }
      /** @type {Record<string, string>} */
      const paths = { 'save-deck': '/api/deck/save', 'delete-deck': '/api/deck/delete', 'create-page': '/api/page/create', 'save-page': '/api/page/save', 'delete-page': '/api/page/delete', 'generate-page': '/api/page/generate',
        'add-module': '/api/page/modules/add', 'delete-component': '/api/page/components/delete', 'move-component': '/api/page/components/move',
        'add-facet': '/api/page/facets/add', 'delete-facet': '/api/page/facets/delete' };
      if (paths[message.type]) {
        if (message.type === 'generate-page') {
          const { session } = /** @type {SessionItems} */ (await chrome.storage.session.get('session'));
          message.payload = { ...message.payload, session };
        }
        const operationId = message.operationId ?? crypto.randomUUID();
        const pending = { operationId, path: paths[message.type], payload: { operationId, payload: message.payload } };
        // Rejections the user resolves in place are not saves waiting for recovery.
        const saved = await saves.perform(pending, auth.token, ['confirmation_required', 'invalid', 'deleted', 'replacement', 'generation_busy',
          ...(message.type === 'generate-page' ? ['generating'] : [])]);
        if (message.type === 'generate-page') void captures.poll().catch(captures.recordError);
        return refreshAfterMutation(saved);
      }
      if (message.type === 'try-saving-again') {
        const captureKey = /** @type {`capture-${string}`} */ (`capture-${message.operationId}`);
        const { [captureKey]: receipt } = await readLocal(captureKey);
        if (receipt && receipt.state !== 'saved') {
          await captures.submit(receipt); return refreshAfterMutation();
        }
        const key = /** @type {`save-${string}`} */ (`save-${message.operationId}`);
        const { [key]: pending } = await readLocal(key);
        if (pending) {
          const saved = await saves.perform(pending, auth.token);
          void captures.poll().catch(captures.recordError);
          return refreshAfterMutation(saved);
        }
        return refreshAfterMutation();
      }
      throw new Error(t('worker.actionUnavailable'));
    } catch (/** @type {any} */ error) {
      if (error.status === 401) { if (version === accessVersion) await removeAccess(); throw Object.assign(new Error(t('worker.signIn')), { code: 'unauthorized' }); }
      throw error;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.theme) void relayFeedbackTheme(changes.theme.newValue).catch(() => {});
  });

  const captures = captureRuntime({ request, initialize, saves, refresh: refreshAccount, removeAccess, diagnostic: diagnostics.record, accepted: badge.added });
  const handleCapture = captures.handleCapture;
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'capture') void handleCapture(info, tab).catch(captures.recordError);
  });
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'recover') void captures.poll().catch(captures.recordError);
    if (alarm.name === 'diagnostics') void diagnostics.flush();
  });

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
    run(message).then(respond, error => respond({ error: error.message, code: error.code, details: error.details }));
    return true;
  });
  chrome.action.onClicked.addListener(() => { void chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }); });
  chrome.runtime.onInstalled.addListener(() => { void initialize().then(state => state.signedIn && captures.poll()).catch(captures.recordError); });
  chrome.runtime.onStartup.addListener(() => { void initialize().then(state => state.signedIn && captures.poll()).catch(captures.recordError); });
  return handleCapture;
}
