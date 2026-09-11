const API = 'http://127.0.0.1:4317';
let initializing;
let polling;

async function api(path, body) {
  const response = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), { code: result.code });
  return result;
}

export async function initialize() {
  if (initializing) return initializing;
  initializing = (async () => {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    let { session } = await chrome.storage.session.get('session');
    if (!session) {
      const local = await chrome.storage.local.get(['installationId', 'epoch']);
      session = {
        installationId: local.installationId ?? crypto.randomUUID(),
        epoch: (local.epoch ?? 0) + 1,
        sessionId: crypto.randomUUID()
      };
      await chrome.storage.local.set({ installationId: session.installationId, epoch: session.epoch });
      await chrome.storage.session.set({ session });
    }
    await api('/session', { operationId: `session-${session.sessionId}`, session });
    const state = await api('/state');
    await chrome.storage.local.set({ snapshot: state.snapshot, connectionError: null });
    await chrome.alarms.create('recover', { periodInMinutes: 0.5 });
    return session;
  })();
  try { return await initializing; }
  catch (error) {
    initializing = undefined;
    await chrome.storage.local.set({ connectionError: error.message });
    throw error;
  }
}

async function showFeedback(tabId, message, failed = false) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (message, failed) => {
        let host = document.querySelector('vocabularium-feedback');
        if (!host) {
          host = document.createElement('vocabularium-feedback');
          host.style.cssText = 'position:fixed;top:18px;right:18px;z-index:2147483647;display:block;';
          host.attachShadow({ mode: 'open' });
          document.documentElement.append(host);
        }
        const item = document.createElement('div');
        item.setAttribute('role', 'status');
        item.style.cssText = 'font:15px system-ui;background:#fff;color:#172c24;padding:14px 18px;margin-bottom:8px;border:1px solid #b0cbbb;border-radius:12px;box-shadow:0 4px 20px #0002;';
        const text = document.createElement('span');
        text.textContent = message;
        const close = document.createElement('button');
        close.textContent = '×';
        close.setAttribute('aria-label', 'Close capture feedback');
        close.style.cssText = 'margin-left:16px;background:transparent;border:0;cursor:pointer;font-size:20px;color:inherit;';
        close.onclick = () => item.remove();
        if (failed) item.style.borderColor = '#bd6868';
        item.append(text, close);
        host.shadowRoot.append(item);
        setTimeout(() => item.remove(), 3000);
      },
      args: [message, failed]
    });
  } catch {
    // Restricted pages cannot receive injected UI. Keep the reading tab focused.
    await chrome.windows.create({
      type: 'popup', focused: false, width: 340, height: 140,
      url: chrome.runtime.getURL(`feedback.html?message=${encodeURIComponent(message)}`)
    });
  }
}

export async function handleCapture(info, tab) {
  const { snapshot } = await chrome.storage.local.get('snapshot');
  const { session } = await chrome.storage.session.get('session');
  if (!session || !snapshot || typeof info.selectionText !== 'string' || !info.selectionText.length) {
    await showFeedback(tab.id, 'Capture unavailable. Open the foundation prototype.', true);
    return;
  }
  const operationId = crypto.randomUUID();
  const receipt = {
    operationId,
    payload: { session, selectedText: info.selectionText, snapshot },
    state: 'pending', createdAt: new Date().toISOString()
  };
  // Each action has its own key: overlapping captures cannot lose each other's receipts.
  await chrome.storage.local.set({ [`capture-${operationId}`]: receipt });
  await showFeedback(tab.id, 'Capture received');
  await submitCapture(receipt);
  return operationId;
}

async function submitCapture(receipt) {
  try {
    const result = await api('/capture', { operationId: receipt.operationId, payload: receipt.payload });
    await chrome.storage.local.set({ [`capture-${receipt.operationId}`]: { ...receipt, state: 'saved', cardId: result.cardId } });
    void poll().catch(recordConnectionError);
  } catch (error) {
    await chrome.storage.local.set({ [`capture-${receipt.operationId}`]: { ...receipt, state: 'pending', error: error.message } });
  }
}

async function recordConnectionError(error) {
  await chrome.storage.local.set({ connectionError: error.message });
}

export async function poll() {
  if (polling) return polling;
  polling = (async () => {
    const session = await initialize();
    while (true) {
      const result = await api('/poll', { session });
      for (const attemptId of result.ready) {
        const operationId = `publish-${attemptId}`;
        const payload = { attemptId, session };
        await chrome.storage.local.set({ [operationId]: { operationId, payload, state: 'pending' } });
        await api('/publish', { operationId, payload });
        await chrome.storage.local.remove(operationId);
      }
      await chrome.storage.local.set({ lastPollAt: Date.now(), connectionError: null });
      if (!result.loading) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  })();
  try { await polling; } finally { polling = undefined; }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture') void handleCapture(info, tab).catch(recordConnectionError);
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'capture', title: 'Add to default deck', contexts: ['selection'] });
  });
  void initialize().then(() => poll()).catch(recordConnectionError);
});
chrome.runtime.onStartup.addListener(() => { void initialize().then(() => poll()).catch(recordConnectionError); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'recover') void poll().catch(recordConnectionError); });
chrome.action.onClicked.addListener(() => { void chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  const run = async () => {
    if (message.type === 'initialize') { await initialize(); void poll().catch(recordConnectionError); return { ok: true }; }
    if (message.type === 'try-saving-again') {
      const key = `capture-${message.operationId}`;
      const { [key]: receipt } = await chrome.storage.local.get(key);
      if (receipt?.state === 'pending') await submitCapture(receipt);
      return { ok: true };
    }
    throw new Error('Unknown prototype message.');
  };
  run().then(respond, error => respond({ error: error.message }));
  return true;
});

// Test access stays inside this local-only extension worker, never on a webpage.
globalThis.foundation = { initialize, handleCapture, poll };
