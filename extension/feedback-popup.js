// @ts-check
import { initializeTheme } from './theme.js';
import { initializeLanguage } from './i18n.ts';
await initializeLanguage();
await initializeTheme();
const params = new URLSearchParams(location.search);
// feedback.html has each of these.
/** @type {HTMLElement} */ (document.querySelector('#message')).textContent = params.get('message');
/** @type {HTMLElement} */ (document.querySelector('.feedback-item')).classList.toggle('failed', params.get('failed') === 'true');
/** @type {HTMLButtonElement} */ (document.querySelector('#close')).onclick = () => window.close();
setTimeout(() => window.close(), 3000);
