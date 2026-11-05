import { t } from './i18n.ts';

// Where a view sits, as a trail of crumbs from Home (0.16.2, replacing each
// view's back link): every crumb but the last leads there; the last names the
// view itself. A crumb's text is the owner's (a deck's name, a page's main
// key), so it is cut to a character limit and keeps its full text as a tooltip.
// `own`: the crumb is the owner's text (a deck's name, a main key), not the interface's.
export type Crumb = Readonly<{ label: string; go?: () => void; own?: boolean }>;
export const CRUMB_LIMIT = 32;
export function crumbText(text: string): { shown: string; full: string } {
  const full = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(full);
  return { shown: characters.length > CRUMB_LIMIT ? `${characters.slice(0, CRUMB_LIMIT - 1).join('').trimEnd()}…` : full, full };
}
export const home = (go: () => void): Crumb => ({ label: t('nav.home'), go });

// The same trail as plain DOM, for the views that are not drawn by React.
export function crumbsElement(crumbs: readonly Crumb[]): HTMLElement {
  const nav = document.createElement('nav'); nav.className = 'crumbs'; nav.setAttribute('aria-label', t('nav.breadcrumb'));
  const list = document.createElement('ol');
  crumbs.forEach((crumb, index) => {
    const item = document.createElement('li');
    const { shown, full } = crumbText(crumb.label);
    const last = index === crumbs.length - 1;
    const node = document.createElement(last || !crumb.go ? 'span' : 'a');
    node.textContent = shown; node.dir = 'auto';
    if (crumb.own) node.className = 'crumb-own';
    if (shown !== full) node.title = full;
    if (last) node.setAttribute('aria-current', 'page');
    else if (crumb.go) { (node as HTMLAnchorElement).href = '#'; node.addEventListener('click', event => { event.preventDefault(); crumb.go!(); }); }
    item.append(node); list.append(item);
  });
  nav.append(list);
  return nav;
}
