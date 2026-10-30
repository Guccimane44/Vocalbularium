import { t } from './i18n.ts';

// Appearance (D05): 'system' follows the operating system and is the default;
// 'light' (Sage) and 'dark' (Moss night) override it. theme.css reads data-theme.
// The choice is three radios drawn as a segmented control (0.13.3, D23; a
// select before).
export const appearance = value => value === 'dark' || value === 'light' ? value : 'system';

export async function initializeTheme() {
  const control = /** @type {HTMLFieldSetElement | null} */ (document.querySelector('#theme-control'));
  const choose = theme => { for (const radio of control?.querySelectorAll('input[name="theme"]') ?? []) radio.checked = radio.value === theme; };
  let revision = 0;
  const apply = value => {
    const theme = appearance(value);
    // data-appearance marks the choice as applied, so app.css can show the page.
    document.documentElement.dataset.appearance = theme;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    choose(theme);
  };
  const changed = (changes, area) => {
    if (area === 'local' && changes.theme) { revision++; apply(changes.theme.newValue); }
  };
  chrome.storage.onChanged.addListener(changed);
  window.addEventListener('pagehide', () => chrome.storage.onChanged.removeListener(changed), { once: true });
  const initialRevision = revision;
  try { const { theme } = await chrome.storage.local.get('theme'); if (revision === initialRevision) apply(theme); }
  catch { if (revision === initialRevision) apply('system'); }
  if (control) control.onchange = async event => {
    const previous = document.documentElement.dataset.theme ?? 'system';
    const theme = appearance(/** @type {HTMLInputElement} */ (event.target).value);
    revision++; apply(theme);
    try {
      await chrome.storage.local.set({ theme });
      document.querySelector('#theme-error').textContent = '';
    } catch {
      apply(previous);
      document.querySelector('#theme-error').textContent = t('settings.appearanceError');
    }
  };
}
