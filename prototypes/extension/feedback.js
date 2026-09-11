document.querySelector('#message').textContent = new URLSearchParams(location.search).get('message');
document.querySelector('#close').onclick = () => window.close();
setTimeout(() => window.close(), 3000);
