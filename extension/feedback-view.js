// Self-contained so Chrome can serialize this same renderer into ordinary webpages.
export function renderFeedback(message, failed, theme, css) {
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
}
