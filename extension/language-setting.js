// @ts-check
import { currentLanguage, offeredLanguages, onLanguageChange, t } from './i18n.ts';

// The Language choice beside Appearance (D14): the account's preference, saved
// through the worker. The interface follows once the refreshed account arrives;
// a failed save keeps the previous language and says so.
/** @param {{ send: (message: Record<string, unknown>) => Promise<unknown> }} options */
export function initializeLanguageSetting({ send }) {
  const control = /** @type {HTMLSelectElement | null} */ (document.querySelector('#language'));
  const error = /** @type {HTMLElement | null} */ (document.querySelector('#language-error'));
  if (!control || !error) return;
  const fill = () => {
    control.replaceChildren(...offeredLanguages().map(({ code, name }) => {
      const option = document.createElement('option');
      option.value = code; option.textContent = name; option.lang = code;
      return option;
    }));
    control.value = currentLanguage();
  };
  fill();
  onLanguageChange(fill);
  control.onchange = async () => {
    const previous = currentLanguage();
    control.disabled = true;
    try {
      await send({ type: 'set-language', language: control.value });
      error.textContent = '';
    } catch {
      control.value = previous;
      error.textContent = t('settings.languageError');
    } finally { control.disabled = false; }
  };
}
