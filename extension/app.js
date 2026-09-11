const app = document.querySelector('#app');
const actions = document.querySelector('#session-actions');
let account;
let signedIn = false;
let renderVersion = 0;

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
function pendingSaves(local) {
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
function statusLabel(status, prefix = '') {
  return element('span', prefix + status[0].toUpperCase() + status.slice(1), `badge status-${status}`);
}
function recentCaptures(local) {
  app.append(element('h2', 'Recent captures', 'section-title'));
  const receipts = Object.entries(local).filter(([key]) => key.startsWith('capture-')).map(([, value]) => value);
  const unsaved = receipts.filter(item => item.state !== 'saved');
  const entries = [
    ...unsaved.map(item => ({ receipt: item, text: item.payload.selectedText, deckId: item.payload.snapshot.id, date: item.createdAt })),
    ...account.cards.filter(card => card.selected_text !== null).map(card => ({ card, text: card.selected_text, deckId: card.deck_id, date: card.created_at }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  if (!entries.length) app.append(element('p', 'Select text on a webpage, then choose “Add to default deck” from the context menu.', 'muted'));
  for (const entry of entries) {
    const row = element('article', undefined, 'capture');
    row.append(element('p', entry.text, 'capture-text'));
    const deck = account.decks.find(deck => deck.id === entry.deckId);
    if (deck) row.append(button(deck.name, () => { location.hash = `deck/${deck.id}`; }));
    if (entry.card) {
      if (entry.card.status) row.append(statusLabel(entry.card.status));
      row.append(button('Open card', () => { location.hash = `card/${entry.card.id}`; }));
    } else {
      row.append(element('p', entry.receipt.state === 'saving' ? 'Saving to your account…' : 'Not saved to your account.', 'muted'));
      if (entry.receipt.error) row.append(element('p', entry.receipt.error, 'error'));
      if (entry.receipt.state === 'pending') row.append(button('Try saving again', async () => {
        try { const next = await send({ type: 'try-saving-again', operationId: entry.receipt.operationId }); account = next.account; signedIn = next.signedIn; await render(); }
        catch (error) { showError(error); }
      }));
    }
    app.append(row);
  }
}
function cardContent(cardId, selectedPageId) {
  const card = account.cards.find(card => card.id === cardId);
  if (!card) { app.append(element('h1', 'Card unavailable'), element('p', 'This card has been deleted.')); return; }
  const deck = account.decks.find(deck => deck.id === card.deck_id);
  app.append(button(`← ${deck.name}`, () => { location.hash = `deck/${deck.id}`; }, 'back'), element('h1', 'Card content'));
  if (card.status) app.append(statusLabel(card.status, 'Card: '));
  const selected = card.pages.find(page => page.page_id === selectedPageId) ?? card.pages[0];
  const bar = element('nav', undefined, 'pages'); bar.setAttribute('aria-label', 'Card pages');
  card.pages.forEach((page, index) => {
    const tab = button(`Page ${index + 1}`, () => { location.hash = `card/${card.id}/${page.page_id}`; });
    tab.setAttribute('aria-current', String(page === selected)); bar.append(tab);
  });
  app.append(bar);
  const panel = element('section', undefined, 'card-page');
  if (selected.status) panel.append(statusLabel(selected.status, 'Page: '));
  panel.append(selected.text ? element('pre', selected.text) : element('p', selected.status === 'loading' ? 'Generating this page…' : selected.status === 'failed' ? 'Generation failed for this page.' : 'This page is empty.', 'muted'));
  app.append(panel);
}
async function render() {
  const version = ++renderVersion;
  const local = await chrome.storage.local.get(null);
  if (version !== renderVersion) return;
  if (!signedIn) { login(); return; }
  actions.replaceChildren(button('Log out', async () => {
    try { await send({ type: 'logout' }); location.hash = ''; login(); } catch (error) { showError(error); }
  }));
  app.replaceChildren();
  const deckId = location.hash.startsWith('#deck/') ? decodeURIComponent(location.hash.slice(6)) : null;
  if (location.hash.startsWith('#card/')) {
    const [, cardId, pageId] = location.hash.split('/'); cardContent(cardId, pageId);
  } else if (deckId) {
    const deck = account.decks.find(deck => deck.id === deckId);
    if (!deck) { location.hash = ''; return; }
    app.append(button('← All decks', () => { location.hash = ''; }, 'back'), element('p', 'YOUR COLLECTION', 'eyebrow'), element('h1', deck.name));
    const cards = account.cards.filter(card => card.deck_id === deckId);
    if (!cards.length) app.append(element('div', 'No cards in this deck yet.', 'empty'));
    else {
      const table = element('table', undefined, 'list');
      const heading = element('tr'); heading.append(element('th', 'Index'), element('th', 'Entry')); table.append(heading);
      for (const [index, card] of cards.entries()) {
        const row = element('tr'), entry = element('td');
        entry.append(button(card.pages[0]?.text || 'Empty front page', () => { location.hash = `card/${card.id}`; }, 'entry'));
        if (card.status) entry.append(statusLabel(card.status));
        row.append(element('td', String(index + 1).padStart(3, '0')), entry); table.append(row);
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
    recentCaptures(local);
  }
  pendingSaves(local);
}

window.addEventListener('hashchange', () => { void render(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && signedIn && Object.keys(changes).some(key => key.startsWith('capture-') || key.startsWith('save-'))) void render();
});
try {
  const state = await send({ type: 'initialize' }); signedIn = state.signedIn; account = state.account; await render();
} catch (error) {
  const cached = await chrome.storage.local.get(['auth', 'account']);
  if (cached.auth && cached.account) { signedIn = true; account = cached.account; await render(); }
  else login();
  showError(error);
}
setInterval(async () => {
  if (!signedIn || document.hidden) return;
  try {
    const next = await send({ type: 'refresh' });
    if (!next.signedIn) { login(); return; }
    if (JSON.stringify(next.account) !== JSON.stringify(account)) { account = next.account; await render(); }
  } catch (error) { showError(error); }
}, 5000);
