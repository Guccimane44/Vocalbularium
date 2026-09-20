import { renderFeedback } from './feedback-view.js';

export async function initializeFeedback() {
  const tab = await chrome.tabs.getCurrent();
  const listener = (message, sender) => {
    // Only the worker may deliver feedback, and only to the tab that invoked capture.
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('background.js') || sender.tab ||
        message.type !== 'dashboard-feedback' || message.tabId !== tab?.id) return;
    renderFeedback(message.message, message.failed, document.documentElement.dataset.theme ?? message.theme, message.css);
  };
  const changed = (changes, area) => {
    if (area === 'local' && changes.theme && globalThis.vocabulariumFeedback) {
      globalThis.vocabulariumFeedback.host.dataset.theme = changes.theme.newValue === 'dark' ? 'dark' : 'light';
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  chrome.storage.onChanged.addListener(changed);
  window.addEventListener('pagehide', () => {
    chrome.runtime.onMessage.removeListener(listener);
    chrome.storage.onChanged.removeListener(changed);
  }, { once: true });
}
