import { deckColour } from './deck-colour.ts';
import { preferredLanguage, isOffered, LANGUAGES, onLanguageChange, t } from './i18n.ts';

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
// Appearance moves between the header and the account menu, which logging
// out discards, so it is kept from the first lookup.
let kept;
const themeControl = () => (kept ??= document.querySelector('#theme-control'));
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
  document.querySelector('.header-actions').prepend(themeControl());
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
    const label = element('span', deck.name, 'nav-label'); label.dir = 'auto';
    link.append(mark, label, count);
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
  showLanguages(menu, false);
}

// The menu's two views: its main entries, or the language list opened from
// the Language row (D14).
function showLanguages(menu, open) {
  menu.querySelector('.account-main')?.toggleAttribute('hidden', open);
  menu.querySelector('.account-languages')?.toggleAttribute('hidden', !open);
}

let unfollowLanguage;
// The Language row and its list. Every interface language is listed in its own
// name; one whose catalogue is not complete and reviewed says Coming soon and
// cannot be picked. Picking one saves the account's preference; the interface
// follows once the refreshed account arrives.
function languageViews(menu, { chooseLanguage, done }) {
  const row = element('button', undefined, 'menu-action language-row');
  row.type = 'button'; row.setAttribute('aria-haspopup', 'true');
  const rowLabel = labelled('span', 'settings.language', 'language-row-label');
  const current = element('span', undefined, 'language-row-value');
  row.append(rowLabel, current);
  const list = element('div', undefined, 'account-languages');
  list.hidden = true; list.setAttribute('role', 'group');
  const back = element('button', undefined, 'menu-action language-back');
  back.type = 'button';
  const choices = element('ul', undefined, 'language-choices');
  const error = element('p', '', 'error language-error'); error.setAttribute('role', 'alert');
  list.append(back, choices, error);
  const fill = () => {
    const name = LANGUAGES.find(language => language.code === preferredLanguage())?.name ?? 'English';
    current.textContent = name; current.lang = preferredLanguage();
    row.setAttribute('aria-label', t('settings.language.row', { language: name }));
    back.textContent = t('settings.language.backLabel'); back.setAttribute('aria-label', t('settings.language.back'));
    list.setAttribute('aria-label', t('settings.language'));
    choices.replaceChildren(...LANGUAGES.map(({ code, name: own, direction }) => {
      const item = element('li');
      const choice = element('button', undefined, 'menu-action language-choice');
      choice.type = 'button'; choice.dataset.language = code;
      const label = element('span', own, 'language-name'); label.lang = code; label.dir = direction;
      choice.append(element('span', '✓', 'language-tick'), label);
      choice.querySelector('.language-tick').setAttribute('aria-hidden', 'true');
      choice.setAttribute('aria-pressed', String(code === preferredLanguage()));
      if (!isOffered(code)) {
        choice.disabled = true;
        choice.append(element('span', t('settings.language.comingSoon'), 'soon'));
      }
      choice.onclick = async () => {
        if (code === preferredLanguage()) { done(); return; }
        error.textContent = '';
        for (const button of choices.querySelectorAll('button')) button.disabled = true;
        try { await chooseLanguage(code); done(); }
        catch { error.textContent = t('settings.languageError'); fill(); }
      };
      item.append(choice);
      return item;
    }));
  };
  fill();
  // One menu per sign-in: the list of the menu logging out discarded stops following.
  unfollowLanguage?.();
  unfollowLanguage = onLanguageChange(fill);
  row.onclick = () => { error.textContent = ''; showLanguages(menu, true); choices.querySelector('button:not(:disabled)')?.focus(); };
  back.onclick = () => { showLanguages(menu, false); row.focus(); };
  return { row, list };
}

// Signed in: one account menu holds appearance, diagnostic logs and log out.
export function renderAccountMenu(root, { logOut, diagnostics, chooseLanguage }) {
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
    const main = element('div', undefined, 'account-main');
    const { row, list } = languageViews(menu, { chooseLanguage, done: () => { closeAccountMenu(); trigger.focus(); } });
    main.append(themeControl(), row, action('account.diagnostics', diagnostics), action('account.logOut', logOut));
    panel.append(main, list);
    // Choosing an appearance is the menu's action: close it and return focus to its trigger.
    panel.querySelector('#theme').addEventListener('change', () => { closeAccountMenu(); trigger.focus(); });
    menu.append(trigger, panel);
    root.replaceChildren(menu);
  }
}
