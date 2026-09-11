export async function showFeedback(tabId, message, failed = false) {
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

