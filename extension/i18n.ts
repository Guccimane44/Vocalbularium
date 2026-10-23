// The interface language (D14). Every interface text is a key in the English
// catalogue, the source; another language's catalogue may lack a key, which
// then shows in English. The account's preference arrives with its summary,
// which the worker keeps in local storage, so the last known language applies
// before the API answers.
import type { InterfaceLanguage } from '@vocabularium/contracts';
import english from './locales/en/messages.json' with { type: 'json' };

export type MessageKey = keyof typeof english;
export type MessageValues = Readonly<Record<string, string | number>>;
// A language's catalogue may also name catalog entries (`catalog.german.label`),
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
// Only languages whose catalogue is complete and reviewed are offered.
const CATALOGUES: Readonly<Partial<Record<InterfaceLanguage, Catalogue>>> = { en: english };
export const ENGLISH: Readonly<Record<MessageKey, string>> = english;

let current: InterfaceLanguage = 'en';
const listeners = new Set<() => void>();

export const offeredLanguages = () => LANGUAGES.filter(language => CATALOGUES[language.code]);
export const isOffered = (value: unknown): value is InterfaceLanguage => offeredLanguages().some(language => language.code === value);
export const currentLanguage = () => current;
export const direction = () => LANGUAGES.find(language => language.code === current)?.direction ?? 'ltr';

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

export function t(key: MessageKey, values?: MessageValues): string {
  const message = CATALOGUES[current]?.[key] ?? english[key];
  if (message === undefined) throw new Error(`Unknown message: ${key}`);
  return format(message, values);
}
// A catalog text (a module's or facet's name, a description) in the current
// language, or the catalog's English.
export const catalogText = (key: string, english: string) => CATALOGUES[current]?.[`catalog.${key}`] ?? english;
// A list of names joined as the language joins them ("German, Chinese").
export const listFormat = (items: readonly string[]) => new Intl.ListFormat(current, { type: 'unit', style: 'short' }).format(items);
export function onLanguageChange(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setLanguage(value: unknown) {
  const next = isOffered(value) ? value : 'en';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.documentElement.dir = LANGUAGES.find(language => language.code === next)?.direction ?? 'ltr';
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

type AccountItems = { account?: { language?: unknown } };
// Applies the stored preference and follows it as the worker refreshes it.
export async function initializeLanguage() {
  try { setLanguage(((await chrome.storage.local.get('account')) as AccountItems).account?.language); }
  catch { setLanguage('en'); }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.account) setLanguage((changes.account.newValue as AccountItems['account'])?.language);
  });
  if (typeof document !== 'undefined') translateDocument();
}
