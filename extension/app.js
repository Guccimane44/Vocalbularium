import { readLocal } from './recovery.js';
import { initializeFeedback } from './feedback-dashboard.js';
import { initializeTheme } from './theme.js';
import { pageViews } from './pages.js';
import { ConfigurationView, newDeckDraft } from './configuration.tsx';
import { deckColour } from './deck-colour.ts';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './dashboard.tsx';
import { diagnosticSettings } from './diagnostic-settings.js';
import { initializeShell, renderAccountMenu, renderSidebar, showSignedOutShell } from './shell.js';
/** @typedef {import('../types/editor-drafts.js').DeckEditorDraft} DeckEditorDraft */

await initializeFeedback();
await initializeTheme();
initializeShell();
const app = document.querySelector('#app');
const actions = document.querySelector('#session-actions');
let account;
let signedIn = false;
let renderVersion = 0;
let viewRoot;
let nextError;
let currentPageDetail, currentDeckDetail;
/** @type {DeckEditorDraft | undefined} */
let configuration;
const viewAccount = value => ({ ...value, pages: value.pages ?? [] });

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (result.error) throw Object.assign(new Error(result.error), { code: result.code, details: result.details });
  return result;
}
const loadPages = (deckId, order, cursor) => send({ type: 'deck-pages', deckId, order, cursor });
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
  signedIn = false; account = undefined; actions.replaceChildren(); showSignedOutShell();
  currentPageDetail = undefined; currentDeckDetail = undefined;
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
const pageUI = pageViews({ getAccount: () => account, send, showError,
  renderView: (Component, props) => {
    if (!viewRoot) viewRoot = createRoot(app);
    flushSync(() => viewRoot.render(createElement(Component, props)));
  },
  refresh: () => render(),
  navigate: hash => { location.hash = hash; },
  applyState: async (next, redraw = true) => { account = next.account; signedIn = next.signedIn; if (redraw) await render(); }
});
let lastHash = location.hash;
// Opening the dashboard clears the toolbar badge of new captures (D05, K21).
const clearBadge = () => {
  if (signedIn && !document.hidden && (location.hash === '' || location.hash === '#')) void send({ type: 'dashboard-seen' }).catch(() => {});
};
document.addEventListener('visibilitychange', clearBadge);

async function render() {
  const focusedMenu = document.activeElement?.dataset.deckOptions;
  const focused = document.activeElement;
  const active = focused?.closest?.('.page-components') && 'selectionStart' in focused ? { id: focused.id, start: focused.selectionStart, end: focused.selectionEnd } : null;
  const version = ++renderVersion;
  const local = await readLocal(null);
  if (version !== renderVersion) return;
  if (!signedIn) { login(); return; }
  clearBadge();
  // Render account pages and capture receipts from the same storage snapshot.
  if (local.account) account = viewAccount(local.account);
  renderAccountMenu(actions, {
    logOut: async () => {
      try { if (!await pageUI.leave()) return; await send({ type: 'logout' }); location.hash = ''; login(); } catch (error) { showError(error); }
    },
    diagnostics: async () => { if (await pageUI.leave()) location.hash = 'diagnostics'; }
  });
  const routeDeck = location.hash.startsWith('#deck/') ? decodeURIComponent(location.hash.slice(6))
    : location.hash.startsWith('#configure/') && location.hash !== '#configure/new' ? location.hash.slice(11)
    : location.hash.startsWith('#new-page/') ? location.hash.slice(10) : null;
  const sidebar = currentDeckId => renderSidebar({
    decks: account.decks, currentDeckId,
    newDeck: () => { configuration = undefined; location.hash = 'configure/new'; }
  });
  sidebar(routeDeck);
  if (location.hash === '#diagnostics') {
    if (viewRoot) { viewRoot.unmount(); viewRoot = undefined; }
    await diagnosticSettings({ send, root: app, navigate: hash => { location.hash = hash; } }); return;
  }
  const deckId = location.hash.startsWith('#deck/') ? decodeURIComponent(location.hash.slice(6)) : null;
  const configId = location.hash.startsWith('#configure/') ? location.hash.slice(11) : null;
  if (configId) {
    if (configuration?.route !== configId) {
      let deck;
      try { deck = configId === 'new' ? newDeckDraft() : await send({ type: 'deck-detail', deckId: configId }); }
      catch (error) { showError(error); location.hash = ''; return; }
      if (version !== renderVersion) return;
      if (!deck) { location.hash = ''; return; }
      configuration = { route: configId, deck: structuredClone({ ...(deck.id ? { id: deck.id } : {}), name: deck.name, colour: deckColour(deck), modules: deck.modules, view: deck.view }) };
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
  const pageRoute = location.hash.startsWith('#page/') || location.hash.startsWith('#new-page/');
  if (!pageRoute) {
    if (deckId && !account.decks.some(deck => deck.id === deckId)) {
      try {
        const detail = await send({ type: 'deck-detail', deckId });
        if (version !== renderVersion) return;
        account = { ...account, decks: [...account.decks, { ...detail, moduleCount: detail.modules.length, pageCount: 0 }] };
      } catch (error) { showError(error); location.hash = ''; return; }
    }
    if (!viewRoot) viewRoot = createRoot(app);
    const error = nextError; nextError = undefined;
    flushSync(() => viewRoot.render(createElement(Dashboard, {
      account, local, deckId, focusedMenu, showPendingSaves: !pageUI.isEditing(), error, loadPages, loadDecks,
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
  let detail, page;
  try {
    if (location.hash.startsWith('#page/')) {
      page = await send({ type: 'page-detail', pageId: routeId });
      detail = await send({ type: 'deck-detail', deckId: page.deckId });
    } else detail = await send({ type: 'deck-detail', deckId: routeId });
    currentPageDetail = page; currentDeckDetail = detail;
  } catch (error) {
    if (error.code !== 'deleted') nextError = error.message;
    if (error.code === 'deleted') { currentPageDetail = undefined; currentDeckDetail = undefined; }
    page = currentPageDetail?.id === routeId ? currentPageDetail : undefined;
    detail = currentDeckDetail?.id === (page?.deckId ?? routeId) ? currentDeckDetail
      : account.defaultDeckSnapshot?.id === routeId ? account.defaultDeckSnapshot : undefined;
  }
  if (version !== renderVersion) return;
  if (page) sidebar(page.deckId);
  account = { ...account, pages: page ? [page] : [], decks: detail
    ? [...account.decks.filter(deck => deck.id !== detail.id), detail] : account.decks };
  const error = nextError; nextError = undefined;
  pageUI.render(location.hash, local, error);
  if (focusedMenu) [...app.querySelectorAll('[data-deck-options]')].find(node => node.dataset.deckOptions === focusedMenu)?.focus();
  if (active?.id) { const input = document.getElementById(active.id); input?.focus(); input?.setSelectionRange?.(active.start, active.end); }
}

window.addEventListener('hashchange', async () => {
  const target = location.hash;
  if (pageUI.isEditing() && !pageUI.matches(target)) {
    history.replaceState(null, '', location.pathname + lastHash);
    if (!await pageUI.leave()) return;
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
    if (JSON.stringify(next.account) !== JSON.stringify(account)) { account = next.account; if (!location.hash.startsWith('#configure/') && location.hash !== '#diagnostics') await render(); }
  } catch (error) { showError(error); }
}, 5000);
