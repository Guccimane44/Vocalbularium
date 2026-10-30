import { deckColour } from './deck-colour.ts';
import { preferredLanguage, isOffered, LANGUAGES, onLanguageChange, t } from './i18n.ts';

// The signed-in shell (D05): the deck sidebar and the account menu around the
// views in #app. Plain DOM, like the session controls it replaces. Since
// 0.13.3 (D23) the account menu sits at the foot of the sidebar, opening
// upward, instead of in the header.

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
// The sidebar's foot, holding the account menu; the sidebar is redrawn around it.
const accountSlot = (() => { const node = document.createElement('div'); node.className = 'sidebar-account'; return node; })();
export const accountRoot = () => accountSlot;
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
  // The decks scroll on their own, so the account menu stays at the foot and can open over the page.
  const scroll = element('div', undefined, 'sidebar-scroll');
  scroll.append(brand, home, heading, list, add);
  nav.replaceChildren(scroll, accountSlot);
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

const icon = paths => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'menu-icon');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); svg.append(path);
  }
  return svg;
};
const ICONS = {
  language: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3.6 9h16.8M3.6 15h16.8', 'M12 3c2.2 2.4 3.3 5.4 3.3 9s-1.1 6.6-3.3 9c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3Z'],
  diagnostics: ['M3 12h4l2.5-6 5 12 2.5-6H21'],
  logOut: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 8l-4 4 4 4', 'M6 12h10'],
  updown: ['M8 9l4-4 4 4', 'M8 15l4 4 4-4']
};
const initial = name => (name.trim()[0] ?? '?').toLocaleUpperCase();

// Signed in: one account menu at the foot of the sidebar (D23, 0.13.3). Its
// trigger shows the account's initial, name and server; the menu opens upward
// over it with Appearance as three icons on one row, the Language row,
// Diagnostic logs and Log out, each row with its icon.
export function renderAccountMenu(root, { username, server, logOut, diagnostics, chooseLanguage }) {
  // An API older than 0.13.3 sends no name: the trigger then reads Account.
  const name = username || t('account.menu');
  // Built once per sign-in, so a periodic rerender never moves a focused control; only the name follows.
  const built = root.querySelector('.account-menu');
  if (built) {
    if (built.dataset.username !== `${preferredLanguage()}:${name}:${server}`) fillIdentity(built, name, Boolean(username), server);
    return;
  }
  {
    const menu = element('div', undefined, 'account-menu');
    const trigger = element('button', undefined, 'account-trigger');
    trigger.type = 'button'; trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'account-panel');
    const who = element('span', undefined, 'account-who');
    who.append(element('span', undefined, 'account-name'), element('span', undefined, 'account-server'));
    trigger.append(element('span', undefined, 'account-avatar'), who, icon(ICONS.updown));
    const panel = element('div', undefined, 'account-panel');
    panel.id = 'account-panel'; panel.hidden = true;
    trigger.onclick = () => {
      const open = panel.hidden;
      panel.hidden = !open; menu.classList.toggle('open', open); trigger.setAttribute('aria-expanded', String(open));
    };
    const action = (key, glyph, run) => {
      const node = element('button', undefined, 'menu-action');
      node.type = 'button';
      node.append(icon(glyph), labelled('span', key));
      node.onclick = () => { closeAccountMenu(); run(); };
      return node;
    };
    const main = element('div', undefined, 'account-main');
    const { row, list } = languageViews(menu, { chooseLanguage, done: () => { closeAccountMenu(); trigger.focus(); } });
    row.prepend(icon(ICONS.language));
    const rule = element('hr', undefined, 'menu-rule');
    main.append(themeControl(), row, action('account.diagnostics', ICONS.diagnostics, diagnostics), rule, action('account.logOut', ICONS.logOut, logOut));
    panel.append(main, list);
    menu.append(panel, trigger);
    fillIdentity(menu, name, Boolean(username), server);
    root.replaceChildren(menu);
  }
}

// The trigger's name and server; the worker, which holds the API origin, names the server.
function fillIdentity(menu, name, known, server) {
  menu.dataset.username = `${preferredLanguage()}:${name}:${server}`;
  menu.querySelector('.account-server').textContent = server ?? '';
  const avatar = menu.querySelector('.account-avatar');
  avatar.textContent = initial(name); avatar.setAttribute('aria-hidden', 'true');
  menu.querySelector('.account-name').textContent = name;
  menu.querySelector('.account-trigger').setAttribute('aria-label', known ? t('account.menuFor', { name }) : t('account.menu'));
}
