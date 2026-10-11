// Appearance (D05): 'system' follows the operating system and is the default;
// 'light' (Sage) and 'dark' (Moss night) override it. theme.css reads data-theme.
export const appearance = value => value === 'dark' || value === 'light' ? value : 'system';

export async function initializeTheme() {
  const control = document.querySelector('#theme');
  let revision = 0;
  const apply = value => {
    const theme = appearance(value);
    // data-appearance marks the choice as applied, so app.css can show the page.
    document.documentElement.dataset.appearance = theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    if (control) control.value = theme;
  };
  const changed = (changes, area) => {
    if (area === 'local' && changes.theme) { revision++; apply(changes.theme.newValue); }
  };
  chrome.storage.onChanged.addListener(changed);
  window.addEventListener('pagehide', () => chrome.storage.onChanged.removeListener(changed), { once: true });
  const initialRevision = revision;
  try { const { theme } = await chrome.storage.local.get('theme'); if (revision === initialRevision) apply(theme); }
  catch { if (revision === initialRevision) apply('system'); }
  if (control) control.onchange = async () => {
    const previous = document.documentElement.dataset.theme ?? 'system';
    const theme = control.value;
    revision++; apply(theme);
    try {
      await chrome.storage.local.set({ theme });
      document.querySelector('#theme-error').textContent = '';
    } catch {
      apply(previous);
      document.querySelector('#theme-error').textContent = 'Appearance could not be saved. Try again.';
    }
  };
}
