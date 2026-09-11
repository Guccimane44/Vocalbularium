import { cardViews } from './cards.js';
import { SORT_ORDERS, sortCards } from './sorting.js';
import { configurationView, newDeckDraft } from './configuration.js';
import { dialog } from './dialog.js';

const app = document.querySelector('#app');
const actions = document.querySelector('#session-actions');
let account;
let signedIn = false;
let renderVersion = 0;
let configuration;

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
  if (result.error) throw Object.assign(new Error(result.error), { code: result.code, details: result.details });
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
  if (location.hash.startsWith('#configure/') || cardUI.isEditing()) return;
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
const cardUI = cardViews({ app, getAccount: () => account, element, button, statusLabel, send, showError,
  navigate: hash => { location.hash = hash; },
  applyState: async (next, redraw = true) => { account = next.account; signedIn = next.signedIn; if (redraw) await render(); }
});
let lastHash = location.hash;
async function render() {
  const active = document.activeElement?.id === 'page-content' ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
  const version = ++renderVersion;
  const local = await chrome.storage.local.get(null);
  if (version !== renderVersion) return;
  if (!signedIn) { login(); return; }
  actions.replaceChildren(button('Log out', async () => {
    try { if (!await cardUI.leave()) return; await send({ type: 'logout' }); location.hash = ''; login(); } catch (error) { showError(error); }
  }));
  app.replaceChildren();
  const deckId = location.hash.startsWith('#deck/') ? decodeURIComponent(location.hash.slice(6)) : null;
  if (location.hash.startsWith('#configure/')) {
    const id = location.hash.slice(11);
    if (configuration?.route !== id) {
      const deck = id === 'new' ? newDeckDraft() : account.decks.find(deck => deck.id === id);
      if (!deck) { location.hash = ''; return; }
      configuration = { route: id, deck: structuredClone(deck), basePageIds: deck.id ? deck.pages.map(page => page.id) : [], selectedPage: deck.pages[0].id };
    }
    configurationView({ app, draft: configuration, element, button, send, showError, onSaved: async next => {
      account = next.account; signedIn = next.signedIn; configuration = undefined; location.hash = ''; await render();
    }, onCancel: () => { configuration = undefined; location.hash = ''; } });
  } else if (location.hash.startsWith('#card/') || location.hash.startsWith('#new-card/')) {
    cardUI.render(location.hash);
  } else if (deckId) {
    const deck = account.decks.find(deck => deck.id === deckId);
    if (!deck) { location.hash = ''; return; }
    app.append(button('← All decks', () => { location.hash = ''; }, 'back'), element('p', 'YOUR COLLECTION', 'eyebrow'), element('h1', deck.name));
    const order = localStorage.getItem(`sort-${deckId}`) ?? 'newest';
    const select = element('select'); select.id = 'card-sort';
    for (const [value, label] of SORT_ORDERS) { const option = element('option', label); option.value = value; select.append(option); }
    select.value = order; select.onchange = () => { localStorage.setItem(`sort-${deckId}`, select.value); void render(); };
    const sortLabel = element('label', 'Sort cards'); sortLabel.htmlFor = select.id;
    app.append(button('Add card manually', () => { location.hash = `new-card/${deckId}`; }, 'primary'), sortLabel, select);
    const cards = sortCards(account.cards.filter(card => card.deck_id === deckId), order);
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
    app.append(element('p', 'YOUR VOCABULARY', 'eyebrow'), element('h1', 'A growing collection.'), element('p', 'Keep the words and expressions you want to come back to.', 'muted'), button('Add new deck', () => { configuration = undefined; location.hash = 'configure/new'; }, 'primary'));
    const grid = element('div', undefined, 'grid');
    for (const deck of account.decks) {
      const article = element('article', undefined, 'deck');
      const open = button('', () => { location.hash = `deck/${deck.id}`; }, 'open');
      open.append(element('h2', deck.name), element('p', `${account.cards.filter(card => card.deck_id === deck.id).length} cards · ${deck.pages.length} pages`, 'muted'));
      const footer = element('footer');
      if (deck.id === account.defaultDeckId) footer.append(element('span', 'DEFAULT DECK', 'badge'));
      const menu = element('details', undefined, 'deck-menu');
      const summary = element('summary', '•••'); summary.setAttribute('aria-label', `Options for ${deck.name}`); menu.append(summary);
      const choices = element('div', undefined, 'menu-choices');
      const setDefault = button('Set as default', async () => {
        try { const result = await send({ type: 'set-default', deckId: deck.id }); account = result.account; signedIn = result.signedIn; await render(); }
        catch (error) { await render(); showError(error); }
      });
      setDefault.disabled = deck.id === account.defaultDeckId;
      choices.append(setDefault, button('Configure deck', () => { configuration = undefined; location.hash = `configure/${deck.id}`; }), button('Delete deck', async () => {
        const replacements = deck.id === account.defaultDeckId ? account.decks.filter(item => item.id !== deck.id) : [];
        const decision = await dialog({ title: 'Delete deck?', message: `“${deck.name}” and all its cards will be deleted.${account.decks.length === 1 ? ' A new empty My Deck will replace it.' : ''}`, choices: ['Cancel', 'Delete deck'], select: replacements.length ? { label: 'New default deck', options: replacements.map(item => ({ value: item.id, label: item.name })) } : undefined });
        if (decision.choice !== 'Delete deck') return;
        try { const next = await send({ type: 'delete-deck', payload: { deckId: deck.id, replacementId: decision.value } }); account = next.account; signedIn = next.signedIn; await render(); }
        catch (error) { showError(error); }
      }));
      menu.append(choices); footer.append(menu);
      article.append(open, footer); grid.append(article);
    }
    app.append(grid);
    recentCaptures(local);
  }
  pendingSaves(local);
  if (active) { const input = document.querySelector('#page-content'); input?.focus(); input?.setSelectionRange(active.start, active.end); }
}

window.addEventListener('hashchange', async () => {
  const target = location.hash;
  if (cardUI.isEditing() && !cardUI.matches(target)) {
    history.replaceState(null, '', location.pathname + lastHash);
    if (!await cardUI.leave()) return;
    history.replaceState(null, '', location.pathname + target);
  }
  lastHash = location.hash;
  await render();
});
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
    if (JSON.stringify(next.account) !== JSON.stringify(account)) { account = next.account; if (!location.hash.startsWith('#configure/')) await render(); }
  } catch (error) { showError(error); }
}, 5000);
