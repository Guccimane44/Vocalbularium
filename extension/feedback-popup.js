import { initializeTheme } from './theme.js';
await initializeTheme();
const params = new URLSearchParams(location.search);
document.querySelector('#message').textContent = params.get('message');
document.querySelector('.feedback-item').classList.toggle('failed', params.get('failed') === 'true');
document.querySelector('#close').onclick = () => window.close();
setTimeout(() => window.close(), 3000);
