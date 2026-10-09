import { currentHash } from '@vocabularium/contracts';
import { readLocal } from './recovery.js';
import { initializeFeedback } from './feedback-dashboard.js';
import { initializeTheme } from './theme.js';
import { karteViews } from './kartes.js';
import { ConfigurationView, newDeckDraft } from './configuration.tsx';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './dashboard.tsx';
/** @typedef {import('../types/editor-drafts.js').DeckEditorDraft} DeckEditorDraft */

await initializeFeedback();
await initializeTheme();
const app = document.querySelector('#app');
const actions = document.querySelector('#session-actions');
let account;
let signedIn = false;
let renderVersion = 0;
let viewRoot;
let nextError;
let currentKarteDetail, currentDeckDetail;
/** @type {DeckEditorDraft | undefined} */
let configuration;
function viewAccount(value) {
  if (Array.isArray(value?.recentKartes)) return value;
  const kartes = value?.kartes ?? [];
  return { ...value, recentKartes: kartes.filter(karte => karte.selected_text !== null).slice(0, 20),
    decks: value.decks.map(deck => ({ ...deck, seiteCount: deck.seites.length,
      karteCount: kartes.filter(karte => karte.deck_id === deck.id).length })),
    defaultDeckSnapshot: value.decks.find(deck => deck.id === value.defaultDeckId),
    nextCursor: null, sequence: value.sequence ?? 0 };
}

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
const loadKartes = (deckId, order, cursor) => send({ type: 'deck-kartes', deckId, order, cursor });
const loadDecks = cursor => send({ type: 'deck-page', cursor });
function showError(error) {
  if (viewRoot) {
    nextError = error.message;
    void render();
    return;
  }
  let notice = app.querySelector('[role="alert"]');
  if (!notice) { notice = element('p', '', 'notice error'); notice.setAttribute('role', 'alert'); app.prepend(notice); }
  notice.textContent = error.message;
}
function login() {
  signedIn = false; account = undefined; actions.replaceChildren();
  currentKarteDetail = undefined; currentDeckDetail = undefined;
  if (viewRoot) { viewRoot.unmount(); viewRoot = undefined; }
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
const karteUI = karteViews({ getAccount: () => account, send, showError,
  renderView: (Component, props) => {
    if (!viewRoot) viewRoot = createRoot(app);
    flushSync(() => viewRoot.render(createElement(Component, props)));
  },
  refresh: () => render(),
  navigate: hash => { location.hash = hash; },
  applyState: async (next, redraw = true) => { account = next.account; signedIn = next.signedIn; if (redraw) await render(); }
});
const normalizeNavigation = () => {
  const current = currentHash(location.hash);
  if (current !== location.hash) history.replaceState(null, '', location.pathname + current);
};
normalizeNavigation();
let lastHash = location.hash;
async function render() {
  const focusedMenu = document.activeElement?.dataset.deckOptions;
  const active = document.activeElement?.id === 'seite-content' ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
  const version = ++renderVersion;
  const local = await readLocal(null);
  if (version !== renderVersion) return;
  if (!signedIn) { login(); return; }
  // Render account kartes and capture receipts from the same storage snapshot.
  if (local.account) account = viewAccount(local.account);
  actions.replaceChildren(button('Log out', async () => {
    try { if (!await karteUI.leave()) return; await send({ type: 'logout' }); location.hash = ''; login(); } catch (error) { showError(error); }
  }));
  const deckId = location.hash.startsWith('#deck/') ? decodeURIComponent(location.hash.slice(6)) : null;
  const configId = location.hash.startsWith('#configure/') ? location.hash.slice(11) : null;
  if (configId) {
    if (configuration?.route !== configId) {
      let deck;
      try { deck = configId === 'new' ? newDeckDraft() : await send({ type: 'deck-detail', deckId: configId }); }
      catch (error) { showError(error); location.hash = ''; return; }
      if (version !== renderVersion) return;
      if (!deck) { location.hash = ''; return; }
      configuration = { route: configId, deck: structuredClone(deck), baseSeiteIds: deck.id ? deck.seites.map(seite => seite.id) : [], selectedSeite: deck.seites[0].id };
    }
    if (!viewRoot) viewRoot = createRoot(app);
    const error = nextError; nextError = undefined;
    flushSync(() => viewRoot.render(createElement(ConfigurationView, {
      key: configId, draft: configuration, send, externalError: error,
      onSaved: async next => {
        account = next.account; signedIn = next.signedIn; configuration = undefined;
        location.hash = ''; await render();
      },
      onCancel: () => { configuration = undefined; location.hash = ''; }
    })));
    return;
  }
  const karteRoute = location.hash.startsWith('#karte/') || location.hash.startsWith('#new-karte/');
  if (!karteRoute) {
    if (deckId && !account.decks.some(deck => deck.id === deckId)) {
      try {
        const detail = await send({ type: 'deck-detail', deckId });
        if (version !== renderVersion) return;
        account = { ...account, decks: [...account.decks, { ...detail, seiteCount: detail.seites.length, karteCount: 0 }] };
      } catch (error) { showError(error); location.hash = ''; return; }
    }
    if (!viewRoot) viewRoot = createRoot(app);
    const error = nextError; nextError = undefined;
    flushSync(() => viewRoot.render(createElement(Dashboard, {
      account, local, deckId, focusedMenu, showPendingSaves: !karteUI.isEditing(), error, loadKartes, loadDecks,
      navigate: hash => { location.hash = hash; },
      configure: id => { configuration = undefined; location.hash = `configure/${id}`; },
      mutate: async command => {
        const next = await send(command);
        account = next.account; signedIn = next.signedIn; await render();
      },
      reportError: showError
    })));
    return;
  }
  const [, routeId] = location.hash.split('/');
  let detail, karte;
  try {
    if (location.hash.startsWith('#karte/')) {
      karte = await send({ type: 'karte-detail', karteId: routeId });
      detail = await send({ type: 'deck-detail', deckId: karte.deck_id });
    } else detail = await send({ type: 'deck-detail', deckId: routeId });
    currentKarteDetail = karte; currentDeckDetail = detail;
  } catch (error) {
    if (error.code !== 'deleted') nextError = error.message;
    if (error.code === 'deleted') { currentKarteDetail = undefined; currentDeckDetail = undefined; }
    karte = currentKarteDetail?.id === routeId ? currentKarteDetail : undefined;
    detail = currentDeckDetail?.id === (karte?.deck_id ?? routeId) ? currentDeckDetail
      : account.defaultDeckSnapshot?.id === routeId ? account.defaultDeckSnapshot : undefined;
  }
  if (version !== renderVersion) return;
  account = { ...account, kartes: karte ? [karte] : [], decks: detail
    ? [...account.decks.filter(deck => deck.id !== detail.id), detail] : account.decks };
  const error = nextError; nextError = undefined;
  karteUI.render(location.hash, local, error);
  if (focusedMenu) [...app.querySelectorAll('[data-deck-options]')].find(node => node.dataset.deckOptions === focusedMenu)?.focus();
  if (active) { const input = document.querySelector('#seite-content'); input?.focus(); input?.setSelectionRange(active.start, active.end); }
}

window.addEventListener('hashchange', async () => {
  normalizeNavigation();
  const target = location.hash;
  if (karteUI.isEditing() && !karteUI.matches(target)) {
    history.replaceState(null, '', location.pathname + lastHash);
    if (!await karteUI.leave()) return;
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
  const cached = await readLocal(['auth', 'account']);
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
