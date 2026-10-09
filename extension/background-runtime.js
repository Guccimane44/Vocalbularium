import { currentValue } from '@vocabularium/contracts';
import { readLocal } from './recovery.js';
import { saveOperations } from './save-operations.js';
import { API_URL } from './config.js';
import { captureRuntime } from './capture.js';
import { captureMenu } from './context-menu.js';
import { relayFeedbackTheme } from './feedback.js';
import { isApiFailure } from './api-failure.js';
import { extensionDiagnostics } from './diagnostics.js';

export function startBackground() {
  const diagnostics = extensionDiagnostics({ upload: async events => {
    const { auth } = await readLocal('auth');
    if (!auth) throw new Error('Collection requires sign-in.');
    const response = await fetch(API_URL + '/api/diagnostics/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ events }), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error('Diagnostic collection is unavailable.');
    return response.json();
  } });
  diagnostics.record({ event: 'worker.started', outcome: 'succeeded' });
  globalThis.addEventListener?.('unhandledrejection', event => diagnostics.record({ event: 'worker.failed', severity: 'error', outcome: 'failed', errorType: event.reason?.name }));
  globalThis.addEventListener?.('error', event => diagnostics.record({ event: 'worker.failed', severity: 'error', outcome: 'failed', errorType: event.error?.name }));
  void chrome.alarms.create('diagnostics', { periodInMinutes: 0.5 });
  let initialization;
  let accessVersion = 0, sessionReady = false;
  let writes = Promise.resolve(), refreshes = Promise.resolve();
  const updateCaptureMenu = captureMenu();
  const saves = saveOperations({ request });
  function writeState(action) {
    const next = writes.then(action); writes = next.catch(() => {}); return next;
  }
  function refreshAccount(savedCapture) {
    const version = accessVersion;
    const next = refreshes.then(async () => {
      if (version !== accessVersion) return { signedIn: false };
      const { auth } = await readLocal('auth');
      if (!auth) return { signedIn: false };
      let account;
      try {
        const summary = await request('/api/account/summary', null, auth.token);
        const recent = await request('/api/captures/recent', null, auth.token);
        account = { ...summary, recentKartes: recent.kartes, kartes: [] };
      }
      catch (error) {
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
  async function clearHandedOffCaptures(account, token, version) {
    const local = await readLocal(null);
    const recentIds = new Set(account.recentKartes.map(karte => karte.id));
    const confirmed = [];
    let detailChecks = 0;
    for (const [key, receipt] of Object.entries(local)) {
      if (!key.startsWith('capture-') || receipt?.state !== 'saved' || !receipt.karteId) continue;
      if (recentIds.has(receipt.karteId)) { confirmed.push([key, receipt.karteId]); continue; }
      if (detailChecks++ >= 10) continue;
      try {
        const karte = await request(`/api/kartes/${encodeURIComponent(receipt.karteId)}`, null, token);
        if (karte.id === receipt.karteId) confirmed.push([key, receipt.karteId]);
      } catch { /* Keep the receipt until handoff can be confirmed. */ }
    }
    if (confirmed.length) await writeState(async () => {
      if (version !== accessVersion) return;
      const current = await readLocal(confirmed.map(([key]) => key));
      const removable = confirmed.filter(([key, karteId]) => current[key]?.state === 'saved' && current[key].karteId === karteId).map(([key]) => key);
      if (removable.length) await chrome.storage.local.remove(removable);
    });
  }
  async function request(path, body, token) {
    const started = performance.now();
    const diagnosticRoute = path.startsWith('/api/diagnostics/');
    const meaningful = !diagnosticRoute && path !== '/api/poll' && !['/api/account/summary', '/api/captures/recent'].includes(path);
    const metadata = { operationId: body?.operationId, karteId: body?.payload?.karteId,
      seiteId: body?.payload?.seiteId, attemptId: body?.payload?.attemptId, method: body ? 'POST' : 'GET', route: path.split('?')[0] };
    diagnostics.addSecret(token);
    if (meaningful) diagnostics.record({ ...metadata, event: 'request.started', outcome: 'started' });
    let response, result;
    try {
      response = await fetch(API_URL + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'X-Vocabularium-Terminology': 'karte-seite', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body && JSON.stringify(body), signal: AbortSignal.timeout(10000)
      });
      result = await response.json();
      if (!result || typeof result !== 'object') throw new Error();
    } catch (error) {
      if (!diagnosticRoute) diagnostics.record({ ...metadata, event: 'request.failed', outcome: 'failed', severity: 'error',
        category: error.name === 'TimeoutError' ? 'timeout' : error instanceof SyntaxError ? 'invalid_response' : 'transport',
        durationMs: Math.round(performance.now() - started) });
      throw new Error('The account server is unavailable or waking up. Wait a minute and try again.');
    }
    diagnostics.addSecret(result.token);
    if (meaningful || (!diagnosticRoute && !response.ok)) diagnostics.record({ ...metadata,
      event: response.ok ? 'request.completed' : 'request.failed', requestId: response.headers?.get('x-request-id'),
      karteId: result.karteId ?? result.cardId ?? metadata.karteId, status: response.status,
      errorCode: result.code, outcome: response.ok ? result.replayed ? 'replayed' : 'succeeded' : 'failed',
      severity: response.ok ? 'info' : 'warn', durationMs: Math.round(performance.now() - started) });
    if (!response.ok) {
      const failure = isApiFailure(result) ? result : { error: 'The account server rejected the request.', code: 'server_error' };
      throw Object.assign(new Error(failure.error), { code: failure.code, status: response.status, details: failure.details });
    }
    return currentValue(result);
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
      let { session } = await chrome.storage.session.get('session');
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
    catch (error) {
      if (initialization === pending) initialization = undefined;
      if (error.status === 401 && version === accessVersion) await removeAccess();
      throw error;
    }
  }

  async function run(message) {
    message = currentValue(message);
    if (message.type === 'diagnostics-status') {
      const local = await diagnostics.status(), { auth } = await readLocal('auth');
      try { return { local, backend: auth ? await request('/api/diagnostics/status', null, auth.token) : null }; }
      catch { return { local, backend: null }; }
    }
    if (message.type === 'diagnostics-configure') return diagnostics.configure({ budgetBytes: message.budgetBytes });
    if (message.type === 'diagnostics-cleanup') {
      const { auth } = await readLocal('auth');
      if (!auth) throw new Error('Sign in to manage backend logs.');
      const backend = await request('/api/diagnostics/cleanup', { ...message.range, preview: message.preview === true }, auth.token);
      if (message.preview) return { backend };
      return { backend, local: await diagnostics.cleanup(backend.range) };
    }
    if (message.type === 'diagnostics-local-cleanup') return { local: await diagnostics.cleanup(message.range) };
    if (message.type === 'diagnostics-flush') { await diagnostics.flush(); return { local: await diagnostics.status() }; }
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
        catch (error) { if (error.status !== 401) throw error; }
      }
      await removeAccess();
      return { signedIn: false };
    }
    if (message.type === 'initialize') {
      const initialized = await initialize();
      if (initialized.signedIn) void captures.poll().catch(captures.recordError);
      return initialized.signedIn ? run({ type: 'refresh' }) : initialized;
    }
    const version = accessVersion;
    const { auth } = await readLocal('auth');
    if (!auth) {
      if (message.type === 'refresh') return { signedIn: false };
      throw Object.assign(new Error('Sign in to continue.'), { code: 'unauthorized' });
    }
    async function refreshAfterMutation(saved) {
      const state = await run({ type: 'refresh' });
      if (!state.signedIn) throw Object.assign(new Error('Sign in to confirm the saved change.'), { code: 'unauthorized' });
      return saved === undefined ? state : { ...state, saved };
    }
    try {
      if (message.type === 'refresh') return sessionReady ? refreshAccount() : initialize();
      if (message.type === 'deck-detail') return request(`/api/decks/${encodeURIComponent(message.deckId)}`, null, auth.token);
      if (message.type === 'karte-detail') return request(`/api/kartes/${encodeURIComponent(message.karteId)}`, null, auth.token);
      if (message.type === 'deck-page') return request(`/api/decks?cursor=${encodeURIComponent(message.cursor)}`, null, auth.token);
      if (message.type === 'deck-kartes') {
        const query = new URLSearchParams({ order: message.order ?? 'newest', limit: String(message.limit ?? 30) });
        if (message.cursor) query.set('cursor', message.cursor);
        return request(`/api/decks/${encodeURIComponent(message.deckId)}/kartes?${query}`, null, auth.token);
      }
      if (message.type === 'set-default') {
        const operationId = message.operationId ?? crypto.randomUUID();
        const pending = { operationId, path: '/api/default-deck', payload: { operationId, deckId: message.deckId } };
        await saves.perform(pending, auth.token);
        return refreshAfterMutation();
      }
      const paths = { 'save-deck': '/api/deck/save', 'delete-deck': '/api/deck/delete', 'create-karte': '/api/karte/create', 'save-karte': '/api/karte/save', 'delete-karte': '/api/karte/delete', 'retry-seite': '/api/karte/retry' };
      if (paths[message.type]) {
        if (message.type === 'retry-seite') {
          const { session } = await chrome.storage.session.get('session');
          message.payload = { ...message.payload, session };
        }
        const operationId = message.operationId ?? crypto.randomUUID();
        const pending = { operationId, path: paths[message.type], payload: { operationId, payload: message.payload } };
        const saved = await saves.perform(pending, auth.token, ['content_loss', 'invalid', 'front_seite', 'deleted', 'replacement', 'generation_busy']);
        if (message.type === 'retry-seite') void captures.poll().catch(captures.recordError);
        return refreshAfterMutation(saved);
      }
      if (message.type === 'try-saving-again') {
        const captureKey = `capture-${message.operationId}`;
        const { [captureKey]: receipt } = await readLocal(captureKey);
        if (receipt && receipt.state !== 'saved') {
          await captures.submit(receipt); return refreshAfterMutation();
        }
        const key = `save-${message.operationId}`;
        const { [key]: pending } = await readLocal(key);
        if (pending) {
          const saved = await saves.perform(pending, auth.token);
          void captures.poll().catch(captures.recordError);
          return refreshAfterMutation(saved);
        }
        return refreshAfterMutation();
      }
      throw new Error('This action is unavailable.');
    } catch (error) {
      if (error.status === 401) { if (version === accessVersion) await removeAccess(); throw Object.assign(new Error('Sign in to continue.'), { code: 'unauthorized' }); }
      throw error;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.theme) void relayFeedbackTheme(changes.theme.newValue).catch(() => {});
  });

  const captures = captureRuntime({ request, initialize, saves, refresh: refreshAccount, removeAccess, diagnostic: diagnostics.record });
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
