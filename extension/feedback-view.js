// Self-contained so Chrome can serialize this same renderer into ordinary webpages.
// With `flight`, the selected text first lifts off the page and flies into the
// popup's place (D05); the popup then appears and lasts as long as before.
export function renderFeedback(message, failed, theme, css, flight, closeLabel = 'Close capture feedback') {
  // This reference lives in the isolated extension world, not page scripts.
  let active = globalThis.vocabulariumFeedback;
  if (active && !active.host.isConnected) { chrome.runtime.onMessage.removeListener(active.listener); active = undefined; }
  if (!active) {
    const host = document.createElement('vocabularium-feedback');
    host.style.cssText = 'all:initial;position:fixed;top:18px;right:18px;z-index:2147483647;display:block;';
    host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = css; host.shadowRoot.append(style);
    const listener = (message, sender) => {
      if (sender.id === chrome.runtime.id && message.type === 'feedback-theme') {
        if (message.theme === 'dark' || message.theme === 'light') host.dataset.theme = message.theme; else delete host.dataset.theme;
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    active = { host, listener }; globalThis.vocabulariumFeedback = active;
    document.documentElement.append(host);
  }
  const { host, listener } = active;
  // No data-theme follows the system setting (D05), as in the extension's views.
  if (theme === 'dark' || theme === 'light') host.dataset.theme = theme; else delete host.dataset.theme;
  const item = document.createElement('div'); item.className = `feedback-item${failed ? ' failed' : ''}`;
  item.setAttribute('role', 'status');
  const mark = document.createElement('span'); mark.className = 'feedback-mark'; mark.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span'); text.className = 'feedback-text'; text.textContent = message;
  const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', closeLabel);
  const remove = () => {
    clearTimeout(timer); item.remove();
    if (!host.shadowRoot.querySelector('.feedback-item')) {
      chrome.runtime.onMessage.removeListener(listener); host.remove();
      if (globalThis.vocabulariumFeedback === active) delete globalThis.vocabulariumFeedback;
    }
  };
  close.onclick = remove; item.append(mark, text, close);
  // The flight starts where the selection is; it is skipped when the page asks
  // for reduced motion, after a failure, or when the selection cannot be read.
  let duration = 0;
  const selection = getSelection();
  const rect = flight && !failed && !matchMedia('(prefers-reduced-motion: reduce)').matches && selection?.rangeCount
    ? selection.getRangeAt(0).getBoundingClientRect() : null;
  if (rect && rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight) {
    const words = flight.replace(/\s+/g, ' ').trim();
    const label = document.createElement('div'); label.className = 'flight-label'; label.setAttribute('aria-hidden', 'true');
    label.textContent = [...words].length > 44 ? [...words].slice(0, 43).join('') + '…' : words;
    host.shadowRoot.append(label);
    const box = label.getBoundingClientRect();
    const from = { x: rect.left + rect.width / 2 - box.width / 2, y: rect.top + rect.height / 2 - box.height / 2 };
    // The popup's left edge, where its mark appears.
    const to = { x: Math.max(8, innerWidth - 230), y: 22 };
    // A short lift, then an arc that rises early and bends toward the popup,
    // staying inside the window.
    const mid = { x: from.x + (to.x - from.x) * 0.3, y: Math.max(8, from.y + (to.y - from.y) * 0.75 - 24) };
    duration = 560;
    label.animate([
      { transform: `translate(${from.x}px, ${from.y}px) scale(1)`, opacity: 1, offset: 0 },
      { transform: `translate(${from.x}px, ${Math.max(8, from.y - 12)}px) scale(1.06)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${mid.x}px, ${mid.y}px) scale(.92)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${to.x}px, ${to.y}px) scale(.7)`, opacity: 0, offset: 1 }
    ], { duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.then(() => label.remove(), () => label.remove());
  }
  // The popup lands as the label arrives; until then there is nothing to close.
  const show = () => { if (host.isConnected) host.shadowRoot.append(item); };
  if (duration) setTimeout(show, duration - 80); else show();
  const expiresAt = Date.now() + duration + 3000;
  const timer = setTimeout(remove, duration + 3000);
  return expiresAt;
}
