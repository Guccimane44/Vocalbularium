const app = document.querySelector('#app');
const actions = document.querySelector('#session-actions');
let account;
let signedIn = false;

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function button(text, onclick, className) {
  const node = element('button', text, className);
  node.onclick = onclick;
  return node;
}
async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (result.error) throw new Error(result.error);
  return result;
}
function showError(error) {
  let notice = app.querySelector('[role="alert"]');
  if (!notice) { notice = element('p', '', 'notice error'); notice.setAttribute('role', 'alert'); app.prepend(notice); }
  notice.textContent = error.message;
}
function login() {
  signedIn = false; account = undefined; actions.replaceChildren();
  const section = element('section', undefined, 'login');
  section.append(element('p', 'A home for the language you discover', 'eyebrow'), element('h1', 'Welcome back.'), element('p', 'Sign in to open your decks and saved vocabulary.', 'muted'));
  const form = element('form');
  for (const [id, text, type] of [['username', 'Username', 'text'], ['password', 'Password', 'password']]) {
    const label = element('label', text); label.htmlFor = id;
    const input = element('input'); input.id = id; input.name = id; input.type = type; input.required = true;
    input.autocomplete = id === 'username' ? 'username' : 'current-password';
    form.append(label, input);
  }
  const submit = element('button', 'Sign in', 'primary'); submit.type = 'submit'; form.append(submit);
  form.onsubmit = async event => {
    event.preventDefault(); submit.disabled = true;
    try {
      const data = new FormData(form);
      const result = await send({ type: 'login', username: data.get('username'), password: data.get('password') });
      signedIn = result.signedIn; account = result.account; location.hash = ''; await render();
    } catch (error) { showError(error); } finally { submit.disabled = false; }
  };
  section.append(form); app.replaceChildren(section);
}
async function pendingSaves() {
  const local = await chrome.storage.local.get(null);
  const pending = Object.entries(local).filter(([key]) => key.startsWith('save-')).map(([, value]) => value);
  for (const item of pending) {
    const notice = element('div', undefined, 'notice');
    notice.append(element('p', 'A change is waiting to be saved to your account.'));
    notice.append(button('Try saving again', async event => {
      const target = event.currentTarget;
      target.disabled = true;
      try { const result = await send({ type: 'try-saving-again', operationId: item.operationId }); account = result.account; signedIn = result.signedIn; await render(); }
      catch (error) { showError(error); target.disabled = false; }
    }));
    app.append(notice);
  }
}
async function render() {
  if (!signedIn) { login(); return; }
  actions.replaceChildren(button('Log out', async () => {
    try { await send({ type: 'logout' }); location.hash = ''; login(); } catch (error) { showError(error); }
  }));
  app.replaceChildren();
  const deckId = location.hash.startsWith('#deck/') ? decodeURIComponent(location.hash.slice(6)) : null;
  if (deckId) {
    const deck = account.decks.find(deck => deck.id === deckId);
    if (!deck) { location.hash = ''; return; }
    app.append(button('← All decks', () => { location.hash = ''; }, 'back'), element('p', 'YOUR COLLECTION', 'eyebrow'), element('h1', deck.name));
    const cards = account.cards.filter(card => card.deck_id === deckId);
    if (!cards.length) app.append(element('div', 'No cards in this deck yet.', 'empty'));
    else {
      const table = element('table', undefined, 'list');
      const heading = element('tr'); heading.append(element('th', 'Index'), element('th', 'Entry')); table.append(heading);
      for (const [index, card] of cards.entries()) {
        const row = element('tr'); row.append(element('td', String(index + 1).padStart(3, '0')), element('td', card.pages[0]?.text || 'Empty front page')); table.append(row);
      }
      app.append(table);
    }
  } else {
    app.append(element('p', 'YOUR VOCABULARY', 'eyebrow'), element('h1', 'A growing collection.'), element('p', 'Keep the words and expressions you want to come back to.', 'muted'));
    const grid = element('div', undefined, 'grid');
    for (const deck of account.decks) {
      const article = element('article', undefined, 'deck');
      const open = button('', () => { location.hash = `deck/${deck.id}`; }, 'open');
      open.append(element('h2', deck.name), element('p', `${account.cards.filter(card => card.deck_id === deck.id).length} cards · ${deck.pages.length} pages`, 'muted'));
      const footer = element('footer');
      if (deck.id === account.defaultDeckId) footer.append(element('span', 'DEFAULT DECK', 'badge'));
      else footer.append(button('Set as default', async () => {
        try { const result = await send({ type: 'set-default', deckId: deck.id }); account = result.account; signedIn = result.signedIn; await render(); }
        catch (error) { await render(); showError(error); }
      }));
      article.append(open, footer); grid.append(article);
    }
    app.append(grid);
  }
  await pendingSaves();
}

window.addEventListener('hashchange', () => { void render(); });
try {
  const state = await send({ type: 'initialize' }); signedIn = state.signedIn; account = state.account; await render();
} catch (error) { login(); showError(error); }
setInterval(async () => {
  if (!signedIn || document.hidden) return;
  try {
    const next = await send({ type: 'refresh' });
    if (!next.signedIn) { login(); return; }
    if (JSON.stringify(next.account) !== JSON.stringify(account)) { account = next.account; await render(); }
  } catch (error) { showError(error); }
}, 5000);
