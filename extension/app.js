// @ts-check
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
import { initializeLanguage, onLanguageChange, t, translateDocument } from './i18n.ts';
import { initializeLanguageSetting } from './language-setting.js';
/** @typedef {import('../types/editor-drafts.js').DeckEditorDraft} DeckEditorDraft */
/** @import { Root } from 'react-dom/client' */
/** @import { Page } from '@vocabularium/contracts' */
/** @import { DashboardAccount } from './dashboard.tsx' */
/** @import { AccessState, DeckDetail, ViewAccount } from '../types/extension.js' */

await initializeLanguage();
await initializeFeedback();
await initializeTheme();
initializeShell();
// Both are in app.html.
const app = /** @type {HTMLElement} */ (document.querySelector('#app'));
const actions = /** @type {HTMLElement} */ (document.querySelector('#session-actions'));
// Set while signed in, which is when the views read it.
/** @type {ViewAccount | undefined} */
let account;
let signedIn = false;
let renderVersion = 0;
/** @type {Root | undefined} */
let viewRoot;
/** @type {string | undefined} */
let nextError;
/** @type {Page | undefined} */
let currentPageDetail;
/** @type {DeckDetail | undefined} */
let currentDeckDetail;
// The deck marked in the sidebar, kept while a page's deck is still loading.
/** @type {string | null} */
let markedDeck = null;
// The account as the last refresh returned it. Views merge the open page and
// deck into `account`, so comparing a refresh with it would always differ.
/** @type {string | undefined} */
let refreshed;
/** @type {DeckEditorDraft | undefined} */
let configuration;
const viewAccount = (/** @type {ViewAccount} */ value) => ({ ...value, pages: value.pages ?? [] });

/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} [text] @param {string} [className] */
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
// The worker's answer; most messages answer with an AccessState.
/** @param {Record<string, unknown>} message @returns {Promise<any>} */
async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (result.error) throw Object.assign(new Error(result.error), { code: result.code, details: result.details });
  return result;
}
/** @type {(deckId: string, order: string, cursor?: string) => Promise<any>} */
const loadPages = (deckId, order, cursor) => send({ type: 'deck-pages', deckId, order, cursor });
const loadDecks = (/** @type {string} */ cursor) => send({ type: 'deck-page', cursor });
/** @param {any} error */
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
  section.append(element('p', t('login.eyebrow'), 'eyebrow'), element('h1', t('login.title')), element('p', t('login.body'), 'muted'));
  const form = element('form');
  for (const [id, text, type] of [['username', t('login.username'), 'text'], ['password', t('login.password'), 'password']]) {
    const label = element('label', text); label.htmlFor = id;
    const input = element('input'); input.id = id; input.name = id; input.type = type; input.required = true;
    input.autocomplete = id === 'username' ? 'username' : 'current-password';
    form.append(label, input);
  }
  const submit = element('button', t('login.submit'), 'primary'); submit.type = 'submit'; form.append(submit);
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
initializeLanguageSetting({ send });
// A new language redraws the static texts and the view in it.
onLanguageChange(() => { translateDocument(); if (signedIn) void render(); else login(); });
const pageUI = pageViews({ getAccount: () => /** @type {ViewAccount} */ (account), send, showError,
  renderView: (Component, props) => {
    if (!viewRoot) viewRoot = createRoot(app);
    flushSync(() => /** @type {Root} */ (viewRoot).render(createElement(Component, props)));
  },
  refresh: () => render(),
  navigate: hash => { location.hash = hash; },
  applyState: async (/** @type {AccessState} */ next, redraw = true) => { account = next.account; signedIn = next.signedIn; if (redraw) await render(); }
});
let lastHash = location.hash;
// Opening the dashboard clears the toolbar badge of new captures (D05, K21).
const clearBadge = () => {
  if (signedIn && !document.hidden && (location.hash === '' || location.hash === '#')) void send({ type: 'dashboard-seen' }).catch(() => {});
};
document.addEventListener('visibilitychange', clearBadge);

async function render() {
  const focusedMenu = /** @type {HTMLElement | null} */ (document.activeElement)?.dataset.deckOptions;
  // An input or a text area when it has `selectionStart`.
  const focused = /** @type {HTMLInputElement | null} */ (document.activeElement);
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
  // A page's deck is known only once the page loads; until then the sidebar
  // keeps the deck of the page shown before, so the mark never blinks off.
  const openPage = location.hash.startsWith('#page/') ? location.hash.slice(6) : null;
  const routeDeck = location.hash.startsWith('#deck/') ? decodeURIComponent(location.hash.slice(6))
    : location.hash.startsWith('#configure/') && location.hash !== '#configure/new' ? location.hash.slice(11)
    : location.hash.startsWith('#new-page/') ? location.hash.slice(10)
    : openPage ? (currentPageDetail?.id === openPage ? currentPageDetail.deckId : markedDeck) : null;
  // From here the view is signed in, with its account.
  const sidebar = (/** @type {string | null} */ currentDeckId) => {
    markedDeck = currentDeckId;
    renderSidebar({ decks: /** @type {ViewAccount} */ (account).decks, currentDeckId, newDeck: () => { configuration = undefined; location.hash = 'configure/new'; } });
  };
  sidebar(routeDeck);
  if (location.hash === '#diagnostics') {
    if (viewRoot) { viewRoot.unmount(); viewRoot = undefined; }
    await diagnosticSettings({ send, root: app, navigate: (/** @type {string} */ hash) => { location.hash = hash; } }); return;
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
    flushSync(() => /** @type {Root} */ (viewRoot).render(createElement(ConfigurationView, {
      key: configId, draft: /** @type {DeckEditorDraft} */ (configuration), send, externalError: error,
      onSaved: async next => {
        account = /** @type {AccessState} */ (next).account; signedIn = /** @type {AccessState} */ (next).signedIn; configuration = undefined;
        location.hash = ''; await render();
      },
      onCancel: () => { configuration = undefined; location.hash = ''; }
    })));
    return;
  }
  const pageRoute = location.hash.startsWith('#page/') || location.hash.startsWith('#new-page/');
  if (!pageRoute) {
    if (deckId && !/** @type {ViewAccount} */ (account).decks.some(deck => deck.id === deckId)) {
      try {
        const detail = await send({ type: 'deck-detail', deckId });
        if (version !== renderVersion) return;
        account = { .../** @type {ViewAccount} */ (account), decks: [.../** @type {ViewAccount} */ (account).decks, { ...detail, moduleCount: detail.modules.length, pageCount: 0 }] };
      } catch (error) { showError(error); location.hash = ''; return; }
    }
    if (!viewRoot) viewRoot = createRoot(app);
    const error = nextError; nextError = undefined;
    // On the dashboard every deck in the account is a summary with its counts.
    flushSync(() => /** @type {Root} */ (viewRoot).render(createElement(Dashboard, {
      account: /** @type {DashboardAccount} */ (account), local, deckId, focusedMenu, showPendingSaves: !pageUI.isEditing(), error, loadPages, loadDecks,
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
  /** @type {DeckDetail | undefined} */
  let detail;
  /** @type {Page | undefined} */
  let page;
  try {
    if (location.hash.startsWith('#page/')) {
      page = await send({ type: 'page-detail', pageId: routeId });
      detail = await send({ type: 'deck-detail', deckId: /** @type {Page} */ (page).deckId });
    } else detail = await send({ type: 'deck-detail', deckId: routeId });
    currentPageDetail = page; currentDeckDetail = detail;
  } catch (/** @type {any} */ error) {
    if (error.code !== 'deleted') nextError = error.message;
    if (error.code === 'deleted') { currentPageDetail = undefined; currentDeckDetail = undefined; }
    page = currentPageDetail?.id === routeId ? currentPageDetail : undefined;
    detail = currentDeckDetail?.id === (page?.deckId ?? routeId) ? currentDeckDetail
      : /** @type {ViewAccount} */ (account).defaultDeckSnapshot?.id === routeId ? /** @type {ViewAccount} */ (account).defaultDeckSnapshot : undefined;
  }
  if (version !== renderVersion) return;
  if (page && page.deckId !== markedDeck) sidebar(page.deckId);
  account = { .../** @type {ViewAccount} */ (account), pages: page ? [page] : [], decks: detail
    ? [.../** @type {ViewAccount} */ (account).decks.filter(deck => deck.id !== /** @type {DeckDetail} */ (detail).id), detail] : /** @type {ViewAccount} */ (account).decks };
  const error = nextError; nextError = undefined;
  pageUI.render(location.hash, local, error);
  if (focusedMenu) [.../** @type {NodeListOf<HTMLElement>} */ (app.querySelectorAll('[data-deck-options]'))].find(node => node.dataset.deckOptions === focusedMenu)?.focus();
  if (active?.id) { const input = /** @type {HTMLInputElement | null} */ (document.getElementById(active.id)); input?.focus(); input?.setSelectionRange?.(active.start, active.end); }
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
  const state = await send({ type: 'initialize' }); signedIn = state.signedIn; account = state.account; refreshed = JSON.stringify(state.account); await render();
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
    const json = JSON.stringify(next.account);
    if (json !== refreshed) { refreshed = json; account = next.account; if (!location.hash.startsWith('#configure/') && location.hash !== '#diagnostics') await render(); }
  } catch (error) { showError(error); }
}, 5000);
