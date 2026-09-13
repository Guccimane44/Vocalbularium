import { API_URL } from './config.js';
import { captureRuntime } from './capture.js';
import { captureMenu } from './context-menu.js';
import { relayFeedbackTheme } from './feedback.js';

let initialization;
let accessVersion = 0, sessionReady = false;
let writes = Promise.resolve(), refreshes = Promise.resolve();
const updateCaptureMenu = captureMenu();
function writeState(action) {
  const next = writes.then(action); writes = next.catch(() => {}); return next;
}
function refreshAccount() {
  const version = accessVersion;
  const next = refreshes.then(async () => {
    if (version !== accessVersion) return { signedIn: false };
    const { auth } = await chrome.storage.local.get('auth');
    if (!auth) return { signedIn: false };
    let account;
    try { account = await request('/api/account', null, auth.token); }
    catch (error) {
      if (version !== accessVersion) return { signedIn: false };
      if (error.status === 401) { await removeAccess(); return { signedIn: false }; }
      throw error;
    }
    return writeState(async () => {
      if (version !== accessVersion) return { signedIn: false };
      await chrome.storage.local.set({ account });
      await updateCaptureMenu(sessionReady ? account : null);
      return version === accessVersion ? { signedIn: true, account } : { signedIn: false };
    });
  });
  refreshes = next.catch(() => {}); return next;
}
async function request(path, body, token) {
  let response, result;
  try {
    response = await fetch(API_URL + path, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body && JSON.stringify(body), signal: AbortSignal.timeout(10000)
    });
    result = await response.json();
    if (!result || typeof result !== 'object') throw new Error();
  } catch {
    throw new Error('The account server is unavailable or waking up. Wait a minute and try again.');
  }
  if (!response.ok) throw Object.assign(new Error(result.error), { code: result.code, status: response.status, details: result.details });
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
  if (initialization) return initialization;
  const version = accessVersion;
  const pending = (async () => {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const { auth } = await chrome.storage.local.get('auth');
    if (!auth) {
      await writeState(async () => { if (version === accessVersion) await updateCaptureMenu(null); });
      return { signedIn: false };
    }
    let { session } = await chrome.storage.session.get('session');
    if (!session) {
      const local = await chrome.storage.local.get(['installationId', 'epoch']);
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
  if (message.type === 'login') {
    const version = ++accessVersion;
    initialization = undefined; sessionReady = false;
    const auth = await request('/api/login', { username: message.username, password: message.password });
    await writeState(async () => { if (version === accessVersion) { await chrome.storage.local.set({ auth }); await updateCaptureMenu(null); } });
    if (version !== accessVersion) return { signedIn: false };
    return initialize();
  }
  if (message.type === 'logout') {
    const { auth } = await chrome.storage.local.get('auth');
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
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth) return { signedIn: false };
  try {
    if (message.type === 'refresh') return sessionReady ? refreshAccount() : initialize();
    if (message.type === 'set-default') {
      const operationId = message.operationId ?? crypto.randomUUID();
      const pending = { operationId, path: '/api/default-deck', payload: { operationId, deckId: message.deckId } };
      await chrome.storage.local.set({ [`save-${operationId}`]: pending });
      await request(pending.path, pending.payload, auth.token);
      await chrome.storage.local.remove(`save-${operationId}`);
      return run({ type: 'refresh' });
    }
    const paths = { 'save-deck': '/api/deck/save', 'delete-deck': '/api/deck/delete', 'create-card': '/api/card/create', 'save-card': '/api/card/save', 'delete-card': '/api/card/delete', 'retry-page': '/api/card/retry' };
    if (paths[message.type]) {
      if (message.type === 'retry-page') {
        const { session } = await chrome.storage.session.get('session');
        message.payload = { ...message.payload, session };
      }
      const operationId = message.operationId ?? crypto.randomUUID();
      const key = `save-${operationId}`;
      const pending = { operationId, path: paths[message.type], payload: { operationId, payload: message.payload } };
      await chrome.storage.local.set({ [key]: pending });
      let saved;
      try { saved = await request(pending.path, pending.payload, auth.token); }
      catch (error) {
        if (['content_loss', 'invalid', 'front_page', 'deleted', 'replacement'].includes(error.code)) await chrome.storage.local.remove(key);
        throw error;
      }
      await chrome.storage.local.remove(key);
      if (message.type === 'retry-page') void captures.poll().catch(captures.recordError);
      return { ...await run({ type: 'refresh' }), saved };
    }
    if (message.type === 'try-saving-again') {
      const captureKey = `capture-${message.operationId}`;
      const { [captureKey]: receipt } = await chrome.storage.local.get(captureKey);
      if (receipt && receipt.state !== 'saved') {
        await captures.submit(receipt); return run({ type: 'refresh' });
      }
      const key = `save-${message.operationId}`;
      const { [key]: pending } = await chrome.storage.local.get(key);
      if (pending) {
        const saved = await request(pending.path, pending.payload, auth.token);
        await chrome.storage.local.remove(key);
        void captures.poll().catch(captures.recordError);
        return { ...await run({ type: 'refresh' }), saved };
      }
      return run({ type: 'refresh' });
    }
    throw new Error('This action is unavailable.');
  } catch (error) {
    if (error.status === 401) { if (version === accessVersion) await removeAccess(); return { signedIn: false }; }
    throw error;
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.theme) void relayFeedbackTheme(changes.theme.newValue).catch(() => {});
});

const captures = captureRuntime({ request, initialize, refresh: () => run({ type: 'refresh' }), removeAccess });
export const handleCapture = captures.handleCapture;
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture') void handleCapture(info, tab).catch(captures.recordError);
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'recover') void captures.poll().catch(captures.recordError);
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  run(message).then(respond, error => respond({ error: error.message, code: error.code, details: error.details }));
  return true;
});
chrome.action.onClicked.addListener(() => { void chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }); });
chrome.runtime.onInstalled.addListener(() => { void initialize().then(state => state.signedIn && captures.poll()).catch(captures.recordError); });
chrome.runtime.onStartup.addListener(() => { void initialize().then(state => state.signedIn && captures.poll()).catch(captures.recordError); });
