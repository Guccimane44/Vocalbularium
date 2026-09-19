import { renderFeedback } from './feedback-view.js';
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
export async function showFeedback(tabId, message, failed = false, sourceUrl) {
  // The capture-time URL keeps closed/navigated product tabs out of the window fallback.
  if (sourceUrl === undefined) {
    try {
      const [context] = await chrome.runtime.getContexts({ tabIds: [tabId], frameIds: [0] });
      sourceUrl = context?.documentUrl ?? (await chrome.tabs.get(tabId)).url;
    } catch { return; }
  }
  if (sourceUrl?.startsWith(chrome.runtime.getURL(''))) {
    try {
      const [{ theme = 'light' }, css] = await Promise.all([chrome.storage.local.get('theme'), styles()]);
      await chrome.runtime.sendMessage({ type: 'dashboard-feedback', tabId, message, failed, theme, css });
    } catch { /* Closing the originating page never interrupts capture or creates a window. */ }
    return;
  }
  let injected = false;
  try {
    const [{ theme = 'light' }, css] = await Promise.all([chrome.storage.local.get('theme'), styles()]);
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: renderFeedback,
      args: [message, failed, theme, css]
    });
    injected = true;
    // Session metadata lets a newly woken worker find only still-active feedback.
    const key = `feedback-${crypto.randomUUID()}`;
    const expiresAt = result[0].result;
    await chrome.storage.session.set({ [key]: { tabId, expiresAt } });
    setTimeout(() => { void chrome.storage.session.remove(key); }, Math.max(0, expiresAt - Date.now()));
    const current = await chrome.storage.local.get('theme');
    await relayFeedbackTheme(current.theme);
  } catch {
    if (injected) return; // A metadata failure must not duplicate feedback already displayed.
    // Restricted pages cannot receive injected UI. Keep the reading tab focused.
    await chrome.windows.create({
      type: 'popup', focused: false, width: 380, height: 170,
      url: chrome.runtime.getURL(`feedback.html?message=${encodeURIComponent(message)}&failed=${failed}`)
    });
  }
}
