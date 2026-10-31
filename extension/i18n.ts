// The interface language (D14). Every interface text is a key in the English
// catalogue, the source; another language's catalogue may lack a key, which
// then shows in English. The account's preference arrives with its summary,
// which the worker keeps in local storage, so the last known language applies
// before the API answers.
import type { InterfaceLanguage } from '@vocabularium/contracts';
import { catalogNames } from '@vocabularium/domain/about';
import english from './locales/en/messages.json' with { type: 'json' };
import arabic from './locales/ar/messages.json' with { type: 'json' };
import chinese from './locales/zh-Hans/messages.json' with { type: 'json' };
import french from './locales/fr/messages.json' with { type: 'json' };
import russian from './locales/ru/messages.json' with { type: 'json' };
import spanish from './locales/es/messages.json' with { type: 'json' };
import reviews from './locales/reviews.json' with { type: 'json' };

export type MessageKey = keyof typeof english;
export type MessageValues = Readonly<Record<string, string | number>>;
// A language's catalogue also names catalog entries (`catalog.german.label`),
// whose English is the catalog itself.
type Catalogue = Readonly<Partial<Record<MessageKey, string>> & Record<string, string>>;

// Each language named in itself, as the settings list it.
export const LANGUAGES: readonly Readonly<{ code: InterfaceLanguage; name: string; direction: 'ltr' | 'rtl' }>[] = [
  { code: 'en', name: 'English', direction: 'ltr' },
  { code: 'ar', name: 'العربية', direction: 'rtl' },
  { code: 'zh-Hans', name: '中文（简体）', direction: 'ltr' },
  { code: 'fr', name: 'Français', direction: 'ltr' },
  { code: 'ru', name: 'Русский', direction: 'ltr' },
  { code: 'es', name: 'Español', direction: 'ltr' }
];
// A module's own names come from its catalog folder (D25); the families' and
// the interface's from the language's messages.
const withNames = (messages: Catalogue, language: InterfaceLanguage): Catalogue => ({ ...messages, ...catalogNames(language) });
export const CATALOGUES: Readonly<Record<InterfaceLanguage, Catalogue>> = { en: english, ar: withNames(arabic, 'ar'), 'zh-Hans': withNames(chinese, 'zh-Hans'),
  fr: withNames(french, 'fr'), ru: withNames(russian, 'ru'), es: withNames(spanish, 'es') };
// A language is offered once its catalogue and explanations are complete (the
// localisation test checks this) and its separate review is recorded here,
// with the reviews of its Expertise writing guide and of the Expertise output
// in it (D15, K42). English, the source, records only those two.
type Reviewed = Readonly<{ reviewed: string; reviewer: string; summary: string }>;
export type Review = Partial<Reviewed> & Readonly<{ writingGuide?: Reviewed; expertise?: Reviewed }>;
export const REVIEWS: Readonly<Partial<Record<InterfaceLanguage, Review>>> = reviews;
export const ENGLISH: Readonly<Record<MessageKey, string>> = english;

// Pseudo-languages for testing (increment B), never offered to users and set
// only by `pseudoLanguage` in local storage: `en-XA` accents and lengthens
// every message inside ⟦…⟧, so text written outside the catalogue and labels
// too narrow for longer languages show; `ar-XB` keeps English and runs right to left.
export const PSEUDO_LANGUAGES = { 'en-XA': 'ltr', 'ar-XB': 'rtl' } as const;
type PseudoLanguage = keyof typeof PSEUDO_LANGUAGES;
const isPseudo = (value: unknown): value is PseudoLanguage => typeof value === 'string' && Object.hasOwn(PSEUDO_LANGUAGES, value);

let current: InterfaceLanguage | PseudoLanguage = 'en';
// The account's preference, kept while a pseudo-language overrides it.
let preference: InterfaceLanguage = 'en';
let pseudo: PseudoLanguage | null = null;
const listeners = new Set<() => void>();

export const offeredLanguages = () => LANGUAGES.filter(language => language.code === 'en' || (REVIEWS[language.code]?.reviewed && REVIEWS[language.code]?.writingGuide && REVIEWS[language.code]?.expertise));
export const isOffered = (value: unknown): value is InterfaceLanguage => offeredLanguages().some(language => language.code === value);
export const currentLanguage = () => current;
// The account's preference, whatever pseudo-language is shown.
export const preferredLanguage = () => preference;
export const direction = () => isPseudo(current) ? PSEUDO_LANGUAGES[current] : LANGUAGES.find(language => language.code === current)?.direction ?? 'ltr';

// `{name}` is replaced by its value; `{count, plural, one {…} other {…}}`
// picks the form for the language, `#` standing for the number.
export function format(message: string, values: MessageValues = {}, locale: string = current): string {
  let out = '';
  for (let index = 0; index < message.length;) {
    if (message[index] !== '{') { out += message[index++]; continue; }
    const end = closing(message, index);
    const [name, kind, ...rest] = message.slice(index + 1, end).split(',');
    const value = values[name.trim()];
    if (kind?.trim() === 'plural') {
      const forms = pluralForms(rest.join(','));
      const count = Number(value);
      const exact = forms[`=${count}`];
      const form = exact ?? forms[new Intl.PluralRules(locale).select(count)] ?? forms.other ?? '';
      out += format(form, values, locale).replaceAll('#', new Intl.NumberFormat(locale).format(count));
    } else out += value === undefined ? message.slice(index, end + 1) : String(value);
    index = end + 1;
  }
  return out;
}
function closing(message: string, start: number) {
  let depth = 0;
  for (let index = start; index < message.length; index++) {
    if (message[index] === '{') depth++;
    if (message[index] === '}' && --depth === 0) return index;
  }
  throw new Error(`Unbalanced message: ${message}`);
}
function pluralForms(body: string) {
  const forms: Record<string, string> = {};
  for (let index = 0; index < body.length;) {
    const open = body.indexOf('{', index);
    if (open < 0) break;
    const end = closing(body, open);
    forms[body.slice(index, open).trim()] = body.slice(open + 1, end);
    index = end + 1;
  }
  return forms;
}

const ACCENTS: Readonly<Record<string, string>> = Object.fromEntries([...'aeiouycnszAEIOUYCNSZ'].map((letter, index) => [letter, [...'áéíóúýçñšžÁÉÍÓÚÝÇÑŠŽ'][index]]));
// A message accented and lengthened by a third, its placeholders and plural
// keywords kept; each plural form is treated in turn.
export function pseudoMessage(message: string): string {
  let out = '', letters = 0;
  for (let index = 0; index < message.length;) {
    if (message[index] !== '{') { const letter = message[index++]; letters += /\p{L}/u.test(letter) ? 1 : 0; out += ACCENTS[letter] ?? letter; continue; }
    const end = closing(message, index);
    const [name, kind, ...rest] = message.slice(index + 1, end).split(',');
    out += kind?.trim() === 'plural'
      ? `{${name},${kind},${Object.entries(pluralForms(rest.join(','))).map(([form, body]) => ` ${form} {${pseudoMessage(body).slice(1, -1)}}`).join('')}}`
      : message.slice(index, end + 1);
    index = end + 1;
  }
  return `⟦${out}${'·'.repeat(Math.ceil(letters / 3))}⟧`;
}
const shown = (message: string) => current === 'en-XA' ? pseudoMessage(message) : message;

export function t(key: MessageKey, values?: MessageValues): string {
  const message = (isPseudo(current) ? undefined : CATALOGUES[current]?.[key]) ?? english[key];
  if (message === undefined) throw new Error(`Unknown message: ${key}`);
  return format(shown(message), values);
}
// A catalog text (a module's or facet's name, a description) in the current
// language, or the catalog's English.
export const catalogText = (key: string, english: string) => (isPseudo(current) ? undefined : CATALOGUES[current]?.[`catalog.${key}`]) ?? shown(english);
// A message from the API in the current language (D14). The API answers in
// English; each `api.*` entry of the English catalogue matches one of its
// messages, its placeholders standing for what the API put there. A message
// without an entry stays as the API wrote it.
let apiPatterns: [RegExp, MessageKey, string[]][] | undefined;
export function apiText(message: string): string {
  apiPatterns ??= (Object.keys(english) as MessageKey[]).filter(key => key.startsWith('api.')).map(key => {
    const names: string[] = [];
    const source = english[key].replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (_, name: string) => { names.push(name); return '(.+?)'; });
    return [new RegExp(`^${source}$`), key, names];
  });
  for (const [pattern, key, names] of apiPatterns) {
    const match = pattern.exec(message);
    if (match) return t(key, Object.fromEntries(names.map((name, index) => [name, match[index + 1]])));
  }
  return message;
}
// A list of names joined as the language joins them ("German and Chinese").
export const listFormat = (items: readonly string[]) => new Intl.ListFormat(current, { type: 'conjunction', style: 'long' }).format(items);
export function onLanguageChange(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setLanguage(value: unknown) {
  preference = isOffered(value) ? value : 'en';
  apply();
}
export function setPseudoLanguage(value: unknown) {
  pseudo = isPseudo(value) ? value : null;
  apply();
}
function apply() {
  const next = pseudo ?? preference;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.documentElement.dir = isPseudo(next) ? PSEUDO_LANGUAGES[next] : LANGUAGES.find(language => language.code === next)?.direction ?? 'ltr';
  }
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}
// Fills every `data-i18n` element of a static page (app.html, feedback.html):
// its text, or the attribute named by `data-i18n-attribute`.
export function translateDocument(root: ParentNode = document) {
  for (const node of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const text = t(node.dataset.i18n as MessageKey);
    if (node.dataset.i18nAttribute) node.setAttribute(node.dataset.i18nAttribute, text);
    else node.textContent = text;
  }
}

type LanguageItems = { account?: { language?: unknown }; pseudoLanguage?: unknown };
// Applies the stored preference and follows it as the worker refreshes it.
export async function initializeLanguage() {
  try {
    const { account, pseudoLanguage } = (await chrome.storage.local.get(['account', 'pseudoLanguage'])) as LanguageItems;
    pseudo = isPseudo(pseudoLanguage) ? pseudoLanguage : null;
    setLanguage(account?.language);
  } catch { setLanguage('en'); }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.pseudoLanguage) setPseudoLanguage(changes.pseudoLanguage.newValue);
    if (changes.account) setLanguage((changes.account.newValue as LanguageItems['account'])?.language);
  });
  if (typeof document !== 'undefined') translateDocument();
}
