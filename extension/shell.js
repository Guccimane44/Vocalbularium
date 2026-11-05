// @ts-check
import { deckColour } from './deck-colour.ts';
import { preferredLanguage, isOffered, LANGUAGES, onLanguageChange, t } from './i18n.ts';
/** @import { ViewDeck } from '../types/extension.js' */
/** @import { InterfaceLanguage } from '@vocabularium/contracts' */
/** @import { MessageKey } from './i18n.ts' */

// The signed-in shell (D05): the deck sidebar and the account menu around the
// views in #app. Plain DOM, like the session controls it replaces. Since
// 0.13.3 (D23) the account menu sits at the foot of the sidebar, opening
// upward, instead of in the header.

/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string} [text] @param {string} [className] */
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

// An element whose text is a catalogue message, redrawn when the language changes.
/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {MessageKey} key @param {string} [className] */
const labelled = (tag, key, className) => { const node = element(tag, t(key), className); node.dataset.i18n = key; return node; };
// app.html has the sidebar, its toggle, the header's actions and the appearance control.
const sidebar = () => /** @type {HTMLElement} */ (document.querySelector('#sidebar'));
// Appearance moves between the header and the account menu, which logging
// out discards, so it is kept from the first lookup.
/** @type {HTMLElement | undefined} */
let kept;
// The sidebar's foot, holding the account menu; the sidebar is redrawn around it.
const accountSlot = (() => { const node = document.createElement('div'); node.className = 'sidebar-account'; return node; })();
export const accountRoot = () => accountSlot;
const themeControl = () => (kept ??= /** @type {HTMLElement} */ (document.querySelector('#theme-control')));
const toggle = () => /** @type {HTMLButtonElement} */ (document.querySelector('#sidebar-toggle'));
const narrow = matchMedia('(max-width: 900px)');

/** @param {boolean} open */
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
    if (menu) { closeAccountMenu(); /** @type {HTMLElement | null} */ (menu.querySelector('.account-trigger'))?.focus(); }
  });
  document.addEventListener('pointerdown', event => {
    const menu = document.querySelector('.account-menu.open');
    const target = /** @type {Node | null} */ (event.target);
    if (menu && !menu.contains(target)) closeAccountMenu();
    if (narrow.matches && sidebar().classList.contains('open') && !sidebar().contains(target) && !toggle().contains(target)) setSidebarOpen(false);
  });
  window.addEventListener('hashchange', () => setSidebarOpen(false));
}

// Signed out: no sidebar, and the appearance choice sits in the header.
export function showSignedOutShell() {
  document.body.classList.remove('signed-in');
  sidebar().hidden = true; sidebar().replaceChildren(); order = [];
  toggle().hidden = true; setSidebarOpen(false);
  /** @type {HTMLElement} */ (document.querySelector('.header-actions')).prepend(themeControl());
}

// Views sometimes merge a fetched deck into the account's list; keep the
// sidebar's order stable across those merges.
/** @type {string[]} */
let order = [];
/** @param {readonly ViewDeck[]} decks */
function stable(decks) {
  const known = new Set(decks.map(deck => deck.id));
  order = [...order.filter(id => known.has(id)), ...decks.map(deck => deck.id).filter(id => !order.includes(id))];
  return [...decks].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

// After a deck is moved (D27), the sidebar takes the account's new order as its own.
/** @param {readonly string[]} ids */
export function keepSidebarOrder(ids) { order = [...ids]; }

/** @param {{ decks: readonly ViewDeck[], currentDeckId: string | null | undefined, newDeck: () => void, moveDeck?: (deckId: string, position: number) => Promise<boolean> }} options */
export function renderSidebar({ decks, currentDeckId, newDeck, moveDeck }) {
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
    link.draggable = false; link.dataset.deckId = deck.id;
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
  const announcer = element('p', undefined, 'visually-hidden'); announcer.setAttribute('role', 'status'); announcer.setAttribute('aria-live', 'assertive');
  nav.replaceChildren(scroll, accountSlot, announcer);
  if (moveDeck) sortableDecks(list, announcer, moveDeck);
}

// The sidebar's decks reorder by dragging a row (D27, 0.16.2), as the deck
// cards on Home do: a pointer that moves more than a few pixels picks the row
// up (a shorter move is a click that opens the deck), the other rows make room,
// and letting go saves the place. From the keyboard, Space picks the focused
// deck up, the arrow keys move it, Space drops it and Escape puts it back,
// each step announced. A failed save puts the rows back as they were.
/** @param {HTMLElement} list @param {HTMLElement} announcer @param {(deckId: string, position: number) => Promise<boolean>} moveDeck */
function sortableDecks(list, announcer, moveDeck) {
  const rows = () => /** @type {HTMLLIElement[]} */ ([...list.children]);
  const nameOf = (/** @type {HTMLElement} */ row) => row.querySelector('.nav-label')?.textContent ?? '';
  const say = (/** @type {string} */ text) => { announcer.textContent = text; };
  // Puts a row back at the place it was picked up from.
  const putBack = (/** @type {HTMLLIElement} */ row, /** @type {number} */ from) => list.insertBefore(row, rows().filter(other => other !== row)[from] ?? null);
  /** @param {HTMLLIElement} row @param {number} from */
  const save = async (row, from) => {
    const to = rows().indexOf(row);
    if (to === from) { say(t('shaping.notMoved', { name: nameOf(row) })); return; }
    say(t('shaping.dropped', { name: nameOf(row) }));
    const id = /** @type {HTMLElement} */ (row.querySelector('[data-deck-id]')).dataset.deckId ?? '';
    if (!(await moveDeck(id, to))) putBack(row, from);
  };
  // The pointer.
  /** @type {{ row: HTMLLIElement, from: number, x: number, y: number, dragging: boolean, pointer: number } | null} */
  let press = null;
  let swallowClick = false;
  list.addEventListener('pointerdown', event => {
    const row = /** @type {HTMLElement} */ (event.target).closest('li');
    if (!row || event.button !== 0) return;
    press = { row: /** @type {HTMLLIElement} */ (row), from: rows().indexOf(/** @type {HTMLLIElement} */ (row)), x: event.clientX, y: event.clientY, dragging: false, pointer: event.pointerId };
  });
  list.addEventListener('pointermove', event => {
    if (!press || event.pointerId !== press.pointer) return;
    const dy = event.clientY - press.y;
    if (!press.dragging) {
      if (Math.hypot(event.clientX - press.x, dy) < 6) return;
      press.dragging = true; press.row.dataset.dragging = '';
      list.setPointerCapture(event.pointerId);
      say(t('shaping.pickedUp', { name: nameOf(press.row) }));
    }
    // The row follows the pointer; it changes place when its middle passes a neighbour's middle.
    const row = press.row;
    const shift = event.clientY - press.y;
    const natural = row.getBoundingClientRect().top - Number(row.dataset.shift ?? 0);
    const middle = natural + row.offsetHeight / 2 + shift;
    const others = rows().filter(other => other !== row);
    const before = others.find(other => { const box = other.getBoundingClientRect(); return middle < box.top + box.height / 2; }) ?? null;
    if (before !== row.nextElementSibling) {
      list.insertBefore(row, before);
      // Its place moved under the pointer: the pointer's start moves with it.
      press.y += row.getBoundingClientRect().top - Number(row.dataset.shift ?? 0) - natural;
    }
    row.dataset.shift = String(event.clientY - press.y);
    row.style.transform = `translateY(${event.clientY - press.y}px)`;
  });
  const end = async (/** @type {PointerEvent} */ event) => {
    if (!press || event.pointerId !== press.pointer) return;
    const { row, from, dragging } = press; press = null;
    if (!dragging) return;
    swallowClick = true; setTimeout(() => { swallowClick = false; });
    row.style.transform = ''; delete row.dataset.dragging; delete row.dataset.shift;
    if (event.type === 'pointercancel') { putBack(row, from); say(t('shaping.cancelled', { name: nameOf(row) })); return; }
    await save(row, from);
  };
  list.addEventListener('pointerup', end); list.addEventListener('pointercancel', end);
  // A drag is not a click: the deck stays closed.
  list.addEventListener('click', event => { if (swallowClick) { event.preventDefault(); event.stopPropagation(); } }, true);
  // The keyboard.
  /** @type {{ row: HTMLLIElement, from: number } | null} */
  let held = null;
  list.addEventListener('keydown', event => {
    const link = /** @type {HTMLElement} */ (event.target).closest('[data-deck-id]');
    const row = /** @type {HTMLLIElement | null} */ (link?.closest('li') ?? null);
    if (!row || !link) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!held) { held = { row, from: rows().indexOf(row) }; row.dataset.dragging = ''; say(t('shaping.pickedUp', { name: nameOf(row) })); return; }
      const { from } = held; held = null; delete row.dataset.dragging; void save(row, from); return;
    }
    if (!held) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      const { from } = held; held = null; delete row.dataset.dragging;
      putBack(row, from);
      /** @type {HTMLElement} */ (row.querySelector('[data-deck-id]')).focus();
      say(t('shaping.cancelled', { name: nameOf(row) }));
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const index = rows().indexOf(row);
    const to = Math.max(0, Math.min(rows().length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
    if (to === index) return;
    list.insertBefore(row, event.key === 'ArrowUp' ? rows()[to] : rows()[to].nextElementSibling);
    /** @type {HTMLElement} */ (row.querySelector('[data-deck-id]')).focus();
    say(t('shaping.overPosition', { name: nameOf(row), position: to + 1 }));
  });
  // Leaving the list lets a held deck go where it is; moving a row in the
  // list blurs it for a moment, so the focus is looked at a tick later.
  list.addEventListener('focusout', () => {
    setTimeout(() => { if (held && !list.contains(document.activeElement)) { delete held.row.dataset.dragging; held = null; } });
  });
}

export function closeAccountMenu() {
  const menu = document.querySelector('.account-menu');
  if (!menu) return;
  menu.classList.remove('open');
  menu.querySelector('.account-trigger')?.setAttribute('aria-expanded', 'false');
  const panel = /** @type {HTMLElement | null} */ (menu.querySelector('.account-panel'));
  if (panel) panel.hidden = true;
  showLanguages(menu, false);
}

// The menu's two views: its main entries, or the language list opened from
// the Language row (D14).
/** @param {Element} menu @param {boolean} open */
function showLanguages(menu, open) {
  menu.querySelector('.account-main')?.toggleAttribute('hidden', open);
  menu.querySelector('.account-languages')?.toggleAttribute('hidden', !open);
}

/** @type {(() => void) | undefined} */
let unfollowLanguage;
// The Language row and its list. Every interface language is listed in its own
// name; one whose catalogue is not complete and reviewed says Coming soon and
// cannot be picked. Picking one saves the account's preference; the interface
// follows once the refreshed account arrives.
/** @param {Element} menu @param {{ chooseLanguage: (language: InterfaceLanguage) => Promise<unknown>, done: () => void }} options */
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
      /** @type {HTMLElement} */ (choice.querySelector('.language-tick')).setAttribute('aria-hidden', 'true');
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
  row.onclick = () => { error.textContent = ''; showLanguages(menu, true); /** @type {HTMLButtonElement | null} */ (choices.querySelector('button:not(:disabled)'))?.focus(); };
  back.onclick = () => { showLanguages(menu, false); row.focus(); };
  return { row, list };
}

/** @param {readonly string[]} paths */
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
/** @param {string} name */
const initial = name => (name.trim()[0] ?? '?').toLocaleUpperCase();

// Signed in: one account menu at the foot of the sidebar (D23, 0.13.3). Its
// trigger shows the account's initial, name and server; the menu opens upward
// over it with Appearance as three icons on one row, the Language row,
// Diagnostic logs and Log out, each row with its icon.
/** @param {HTMLElement} root @param {{ username?: string, server?: string, logOut: () => void, diagnostics: () => void, chooseLanguage: (language: InterfaceLanguage) => Promise<unknown> }} options */
export function renderAccountMenu(root, { username, server, logOut, diagnostics, chooseLanguage }) {
  // An API older than 0.13.3 sends no name: the trigger then reads Account.
  const name = username || t('account.menu');
  // Built once per sign-in, so a periodic rerender never moves a focused control; only the name follows.
  const built = /** @type {HTMLElement | null} */ (root.querySelector('.account-menu'));
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
      // Only this menu sets it, to true or false.
      const open = /** @type {boolean} */ (panel.hidden);
      panel.hidden = !open; menu.classList.toggle('open', open); trigger.setAttribute('aria-expanded', String(open));
    };
    /** @param {MessageKey} key @param {readonly string[]} glyph @param {() => void} run */
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
// The menu has each of these parts (renderAccountMenu).
/** @param {HTMLElement} menu @param {string} name @param {boolean} known @param {string | undefined} server */
function fillIdentity(menu, name, known, server) {
  menu.dataset.username = `${preferredLanguage()}:${name}:${server}`;
  /** @type {HTMLElement} */ (menu.querySelector('.account-server')).textContent = server ?? '';
  const avatar = /** @type {HTMLElement} */ (menu.querySelector('.account-avatar'));
  avatar.textContent = initial(name); avatar.setAttribute('aria-hidden', 'true');
  /** @type {HTMLElement} */ (menu.querySelector('.account-name')).textContent = name;
  /** @type {HTMLElement} */ (menu.querySelector('.account-trigger')).setAttribute('aria-label', known ? t('account.menuFor', { name }) : t('account.menu'));
}
