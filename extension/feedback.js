let feedbackStyles;
async function styles() {
  feedbackStyles ??= Promise.all(['theme.css', 'feedback.css'].map(async file => {
    const response = await fetch(chrome.runtime.getURL(file));
    return response.text();
  })).then(parts => parts.join('\n')).catch(error => { feedbackStyles = undefined; throw error; });
  return feedbackStyles;
}
export async function relayFeedbackTheme(theme) {
  const session = await chrome.storage.session.get(null);
  const now = Date.now(), tabs = new Set(), expired = [];
  for (const [key, item] of Object.entries(session)) {
    if (!key.startsWith('feedback-')) continue;
    if (item.expiresAt > now) tabs.add(item.tabId); else expired.push(key);
  }
  if (expired.length) await chrome.storage.session.remove(expired);
  await Promise.all([...tabs].map(tabId => chrome.tabs.sendMessage(tabId, { type: 'feedback-theme', theme: theme === 'dark' ? 'dark' : 'light' }).catch(() => {})));
}
export async function showFeedback(tabId, message, failed = false) {
  try {
    const [{ theme = 'light' }, css] = await Promise.all([chrome.storage.local.get('theme'), styles()]);
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (message, failed, theme, css) => {
        // This reference lives in the isolated extension world, not page scripts.
        let active = globalThis.vocabulariumFeedback;
        if (active && !active.host.isConnected) { chrome.runtime.onMessage.removeListener(active.listener); active = undefined; }
        if (!active) {
          const host = document.createElement('vocabularium-feedback');
          host.style.cssText = 'all:initial;position:fixed;top:18px;right:18px;z-index:2147483647;display:block;';
          host.attachShadow({ mode: 'open' });
          const style = document.createElement('style'); style.textContent = css; host.shadowRoot.append(style);
          const listener = (message, sender) => {
            if (sender.id === chrome.runtime.id && message.type === 'feedback-theme') host.dataset.theme = message.theme === 'dark' ? 'dark' : 'light';
          };
          chrome.runtime.onMessage.addListener(listener);
          active = { host, listener }; globalThis.vocabulariumFeedback = active;
          document.documentElement.append(host);
        }
        const { host, listener } = active;
        host.dataset.theme = theme === 'dark' ? 'dark' : 'light';
        const item = document.createElement('div'); item.className = `feedback-item${failed ? ' failed' : ''}`;
        item.setAttribute('role', 'status');
        const text = document.createElement('span'); text.textContent = message;
        const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', 'Close capture feedback');
        const remove = () => {
          clearTimeout(timer); item.remove();
          if (!host.shadowRoot.querySelector('.feedback-item')) {
            chrome.runtime.onMessage.removeListener(listener); host.remove();
            if (globalThis.vocabulariumFeedback === active) delete globalThis.vocabulariumFeedback;
          }
        };
        close.onclick = remove; item.append(text, close); host.shadowRoot.append(item);
        const expiresAt = Date.now() + 3000;
        const timer = setTimeout(remove, 3000);
        return expiresAt;
      },
      args: [message, failed, theme, css]
    });
    // Session metadata lets a newly woken worker find only still-active feedback.
    const key = `feedback-${crypto.randomUUID()}`;
    const expiresAt = result[0].result;
    await chrome.storage.session.set({ [key]: { tabId, expiresAt } });
    setTimeout(() => { void chrome.storage.session.remove(key); }, Math.max(0, expiresAt - Date.now()));
    const current = await chrome.storage.local.get('theme');
    await relayFeedbackTheme(current.theme);
  } catch {
    // Restricted pages cannot receive injected UI. Keep the reading tab focused.
    await chrome.windows.create({
      type: 'popup', focused: false, width: 380, height: 170,
      url: chrome.runtime.getURL(`feedback.html?message=${encodeURIComponent(message)}&failed=${failed}`)
    });
  }
}
