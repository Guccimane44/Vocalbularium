import { deckColour } from './deck-colour.ts';
import { t } from './i18n.ts';

// The signed-in shell (D05): the deck sidebar and the account menu around the
// views in #app. Plain DOM, like the session controls it replaces.

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

// An element whose text is a catalogue message, redrawn when the language changes.
const labelled = (tag, key, className) => { const node = element(tag, t(key), className); node.dataset.i18n = key; return node; };
const sidebar = () => document.querySelector('#sidebar');
// Appearance and Language move between the header and the account menu, which
// logging out discards, so they are kept from the first lookup.
let kept;
const controls = () => (kept ??= { theme: document.querySelector('#theme-control'), language: document.querySelector('#language-control') });
const toggle = () => document.querySelector('#sidebar-toggle');
const narrow = matchMedia('(max-width: 900px)');

function setSidebarOpen(open) {
  sidebar()?.classList.toggle('open', open);
  toggle()?.setAttribute('aria-expanded', String(open));
}

export function initializeShell() {
  toggle().onclick = () => setSidebarOpen(toggle().getAttribute('aria-expanded') !== 'true');
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (sidebar().classList.contains('open')) { setSidebarOpen(false); toggle().focus(); }
    const menu = document.querySelector('.account-menu.open');
    if (menu) { closeAccountMenu(); menu.querySelector('.account-trigger')?.focus(); }
  });
  document.addEventListener('pointerdown', event => {
    const menu = document.querySelector('.account-menu.open');
    if (menu && !menu.contains(event.target)) closeAccountMenu();
    if (narrow.matches && sidebar().classList.contains('open') && !sidebar().contains(event.target) && !toggle().contains(event.target)) setSidebarOpen(false);
  });
  window.addEventListener('hashchange', () => setSidebarOpen(false));
}

// Signed out: no sidebar, and the appearance choice sits in the header.
export function showSignedOutShell() {
  document.body.classList.remove('signed-in');
  sidebar().hidden = true; sidebar().replaceChildren(); order = [];
  toggle().hidden = true; setSidebarOpen(false);
  const { theme, language } = controls();
  document.querySelector('.header-actions').prepend(theme, language);
  language.hidden = true;
}

// Views sometimes merge a fetched deck into the account's list; keep the
// sidebar's order stable across those merges.
let order = [];
function stable(decks) {
  const known = new Set(decks.map(deck => deck.id));
  order = [...order.filter(id => known.has(id)), ...decks.map(deck => deck.id).filter(id => !order.includes(id))];
  return [...decks].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export function renderSidebar({ decks, currentDeckId, newDeck }) {
  document.body.classList.add('signed-in');
  const nav = sidebar();
  nav.hidden = false; toggle().hidden = false;
  const brand = element('a', 'Vocabularium', 'brand');
  brand.href = '#'; brand.append(element('span', '.', 'brand-mark'));
  const home = element('a', t('nav.home'), 'nav-item');
  home.href = '#';
  if (!location.hash || location.hash === '#') home.setAttribute('aria-current', 'page');
  const heading = element('p', t('nav.decks'), 'nav-heading');
  const list = element('ul', undefined, 'nav-decks');
  for (const deck of stable(decks)) {
    const item = element('li');
    const link = element('a', undefined, `nav-item fam-${deckColour(deck)}`);
    link.href = `#deck/${encodeURIComponent(deck.id)}`;
    if (deck.id === currentDeckId) link.setAttribute('aria-current', 'page');
    const mark = element('span', undefined, 'fam-mark'); mark.setAttribute('aria-hidden', 'true');
    const count = element('span', String(deck.pageCount ?? 0), 'nav-count');
    count.setAttribute('aria-label', t('deck.pageCount', { count: deck.pageCount ?? 0 }));
    link.append(mark, element('span', deck.name, 'nav-label'), count);
    item.append(link); list.append(item);
  }
  const add = element('button', t('nav.newDeck'), 'nav-item nav-add');
  add.type = 'button'; add.onclick = newDeck;
  nav.replaceChildren(brand, home, heading, list, add);
}

export function closeAccountMenu() {
  const menu = document.querySelector('.account-menu');
  if (!menu) return;
  menu.classList.remove('open');
  menu.querySelector('.account-trigger')?.setAttribute('aria-expanded', 'false');
  const panel = menu.querySelector('.account-panel');
  if (panel) panel.hidden = true;
}

// Signed in: one account menu holds appearance, diagnostic logs and log out.
export function renderAccountMenu(root, { logOut, diagnostics }) {
  // Built once per sign-in, so a periodic rerender never moves a focused control.
  if (root.querySelector('.account-menu')) return;
  {
    const menu = element('div', undefined, 'account-menu');
    const trigger = labelled('button', 'account.menu', 'account-trigger');
    trigger.type = 'button'; trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'account-panel');
    const panel = element('div', undefined, 'account-panel');
    panel.id = 'account-panel'; panel.hidden = true;
    trigger.onclick = () => {
      const open = panel.hidden;
      panel.hidden = !open; menu.classList.toggle('open', open); trigger.setAttribute('aria-expanded', String(open));
    };
    const action = (key, run) => {
      const node = labelled('button', key, 'menu-action');
      node.type = 'button';
      node.onclick = () => { closeAccountMenu(); run(); };
      return node;
    };
    const { theme, language } = controls(); language.hidden = false;
    panel.append(theme, language, action('account.diagnostics', diagnostics), action('account.logOut', logOut));
    // Choosing an appearance or a language is the menu's action: close it and return focus to its trigger.
    for (const control of panel.querySelectorAll('#theme, #language')) control.addEventListener('change', () => { closeAccountMenu(); trigger.focus(); });
    menu.append(trigger, panel);
    root.replaceChildren(menu);
  }
}
