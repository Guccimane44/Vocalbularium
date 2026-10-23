import { useEffect, useId, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { CATALOG, isModuleType } from '@vocabularium/domain/page-modules';
import { mainKeyTier, wordCount } from './main-key.ts';
import { currentLanguage, t } from './i18n.ts';
import type { MessageKey } from './i18n.ts';

// Page list layouts and quiet list states (D05): a completed page shows no
// status; saving, generating, failed and not-saved replace the meaning line.
export type PageStatus = 'completed' | 'loading' | 'failed' | null;
export type SummaryModule = { type: string; status: PageStatus; filled: boolean };
export type ListPage = {
  id: string;
  createdAt: string;
  mainKey: string;
  status: PageStatus;
  meaning?: string | null;
  modules?: SummaryModule[];
};
export type Layout = 'list' | 'table' | 'gallery';
export const LAYOUTS: [Layout, MessageKey][] = [['list', 'layout.list'], ['table', 'layout.table'], ['gallery', 'layout.gallery']];
export const isLayout = (value: unknown): value is Layout => LAYOUTS.some(([layout]) => layout === value);

type Navigate = (hash: string) => void;

const familyOf = (type: string) => isModuleType(type) ? CATALOG[type].family : null;

// Motion (D05): which entries just arrived in a list, so they can slide in.
// Only entries inserted among the previous ones count, never a first render or
// (unless `appended`) a loaded batch at the end. An arrival stays marked while it moves.
export function useArrivals(ids: string[], { appended = false } = {}) {
  const previous = useRef<string[] | null>(null);
  const marked = useRef(new Map<string, number>());
  const now = Date.now();
  if (previous.current) {
    const before = new Set(previous.current);
    ids.forEach((id, index) => { if (!before.has(id) && (appended || index < previous.current!.length) && !marked.current.has(id)) marked.current.set(id, now); });
  }
  for (const [id, at] of marked.current) if (now - at > 700) marked.current.delete(id);
  useEffect(() => { previous.current = ids; });
  return (id: string) => marked.current.has(id) || undefined;
}

// One small mark per filled component, in page order, with one text alternative.
export function FamilyMarks({ modules }: { modules?: SummaryModule[] }) {
  const filled = (modules ?? []).filter(module => module.filled && familyOf(module.type));
  // Marks pop in as components finish, not when the list first appears.
  const shown = useRef<number | null>(null);
  const before = shown.current;
  useEffect(() => { shown.current = filled.length; });
  if (!filled.length) return null;
  const label = t('pageList.modulesFilled', { count: filled.length });
  return <span className="fam-marks" role="img" aria-label={label} title={label}>
    {filled.map((module, index) => <span className={`fam-mark fam-${familyOf(module.type)}`} key={index}
      data-new={before !== null && index >= before ? true : undefined} />)}
  </span>;
}

// "Generating", or "Generating 1 of 2" when several components are attempted.
function generatingLabel(modules?: SummaryModule[]) {
  const attempted = (modules ?? []).filter(module => module.status !== null);
  const finished = attempted.filter(module => module.status !== 'loading').length;
  return attempted.length > 1 ? t('status.generatingOf', { finished, total: attempted.length }) : t('status.generating');
}

export function GeneratingStatus({ label = t('status.generating') }: { label?: string }) {
  return <span className="list-status" data-status="loading">
    <span className="dots" aria-hidden="true"><i /><i /><i /></span>{label}
  </span>;
}

export function SavingStatus() {
  return <span className="list-status" data-status="saving">
    <svg className="clock" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    {t('status.savingToAccount')}
  </span>;
}

// The line under the main key: status when there is one, else the meaning.
export function MeaningLine({ page, navigate }: { page: ListPage; navigate: Navigate }) {
  if (page.status === 'loading') return <span className="meaning-line"><GeneratingStatus label={generatingLabel(page.modules)} /></span>;
  if (page.status === 'failed') return <span className="meaning-line">
    <span className="list-status" data-status="failed">{t('status.generationFailed')}</span>
    <button className="retry" onClick={event => { event.stopPropagation(); navigate(`page/${page.id}`); }}>{t('pageList.retry')}</button>
  </span>;
  const tier = mainKeyTier(page.mainKey);
  if (tier === 'passage') return <span className="meaning-line muted">{t('pageList.passage', { count: wordCount(page.mainKey) })}</span>;
  const kind = tier === 'sentence' ? t('pageList.sentence') : null;
  if (!kind && !page.meaning) return null;
  // The meaning is the page's content, isolated in its own direction (D14).
  return <span className="meaning-line muted">{kind}{kind && page.meaning && ' · '}{page.meaning && <bdi className="meaning">{page.meaning}</bdi>}</span>;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// Group headings for the creation-time orders: Today, Yesterday, then month and day.
export function dateGroup(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (sameDay(date, now)) return t('time.today');
  if (sameDay(date, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return t('time.yesterday');
  return date.toLocaleDateString(currentLanguage(), { day: 'numeric', month: 'long', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(currentLanguage(), { day: 'numeric', month: 'short', year: 'numeric' });

// The row, card or table row opens its page; selecting its text does not.
function useOpen<T extends HTMLElement>(page: ListPage, navigate: Navigate) {
  const item = useRef<T>(null);
  const selecting = (event: ReactMouseEvent) => {
    const selection = window.getSelection();
    return Boolean(event.detail && selection && !selection.isCollapsed && item.current?.contains(selection.anchorNode) && item.current.contains(selection.focusNode));
  };
  return {
    ref: item,
    onClick: (event: ReactMouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a, button')) return;
      if (!selecting(event)) navigate(`page/${page.id}`);
    },
    link: (event: ReactMouseEvent) => { if (selecting(event)) event.preventDefault(); }
  };
}

function KeyLink({ page, link, describedBy }: { page: ListPage; link: (event: ReactMouseEvent) => void; describedBy?: string }) {
  return <a className="entry" dir="auto" href={`#page/${page.id}`} onClick={link} aria-describedby={describedBy}
    data-tier={mainKeyTier(page.mainKey)}>{page.mainKey}</a>;
}

function ListRow({ page, navigate, arrived }: { page: ListPage; navigate: Navigate; arrived?: boolean }) {
  const open = useOpen<HTMLLIElement>(page, navigate);
  const meaning = useId();
  return <li className="page-row" data-page-id={page.id} data-state={page.status ?? 'neutral'} data-arrived={arrived} ref={open.ref} onClick={open.onClick}>
    <span className="page-row-text">
      <KeyLink page={page} link={open.link} describedBy={meaning} />
      <span id={meaning}><MeaningLine page={page} navigate={navigate} key={page.status ?? 'none'} /></span>
    </span>
    <FamilyMarks modules={page.modules} />
    <span className="row-open" aria-hidden="true">{t('pageList.open')}</span>
  </li>;
}

function TableRow({ page, navigate, arrived }: { page: ListPage; navigate: Navigate; arrived?: boolean }) {
  const open = useOpen<HTMLTableRowElement>(page, navigate);
  return <tr className="page-row" data-page-id={page.id} data-state={page.status ?? 'neutral'} data-arrived={arrived} ref={open.ref} onClick={open.onClick}>
    <td className="key-cell"><KeyLink page={page} link={open.link} /></td>
    <td><MeaningLine page={page} navigate={navigate} key={page.status ?? 'none'} /></td>
    <td><FamilyMarks modules={page.modules} /></td>
    <td className="date-cell"><time dateTime={page.createdAt}>{shortDate(page.createdAt)}</time></td>
  </tr>;
}

function GalleryCard({ page, navigate, arrived }: { page: ListPage; navigate: Navigate; arrived?: boolean }) {
  const open = useOpen<HTMLLIElement>(page, navigate);
  return <li className="page-card" data-page-id={page.id} data-state={page.status ?? 'neutral'} data-arrived={arrived} ref={open.ref} onClick={open.onClick}>
    <FamilyMarks modules={page.modules} />
    <KeyLink page={page} link={open.link} />
    <MeaningLine page={page} navigate={navigate} key={page.status ?? 'none'} />
    <time className="card-date" dateTime={page.createdAt}>{shortDate(page.createdAt)}</time>
  </li>;
}

function groups(pages: ListPage[], grouped: boolean) {
  if (!grouped) return [{ label: null, pages }];
  const result: { label: string | null; pages: ListPage[] }[] = [];
  for (const page of pages) {
    const label = dateGroup(page.createdAt);
    if (result.at(-1)?.label === label) result.at(-1)!.pages.push(page);
    else result.push({ label, pages: [page] });
  }
  return result;
}

export function PageList({ pages, layout, order, navigate }: { pages: ListPage[]; layout: Layout; order: string; navigate: Navigate }) {
  const arrived = useArrivals(pages.map(page => page.id));
  if (layout === 'table') return <table className="page-table">
    <thead><tr><th scope="col">{t('module.mainKey')}</th><th scope="col">{t('pageList.meaning')}</th><th scope="col">{t('shaping.modules')}</th><th scope="col">{t('pageList.date')}</th></tr></thead>
    <tbody>{pages.map(page => <TableRow page={page} navigate={navigate} key={page.id} arrived={arrived(page.id)} />)}</tbody>
  </table>;
  const sections = groups(pages, order === 'newest' || order === 'oldest');
  const body = (items: ListPage[]): ReactNode => layout === 'gallery'
    ? <ul className="page-gallery">{items.map(page => <GalleryCard page={page} navigate={navigate} key={page.id} arrived={arrived(page.id)} />)}</ul>
    : <ul className="page-rows">{items.map(page => <ListRow page={page} navigate={navigate} key={page.id} arrived={arrived(page.id)} />)}</ul>;
  return <div className={`page-list layout-${layout}`}>
    {sections.map(section => section.label === null ? <div key="all">{body(section.pages)}</div>
      : <section className="date-group" key={section.label} aria-label={section.label}>
        <h2 className="group-heading">{section.label}</h2>
        {body(section.pages)}
      </section>)}
  </div>;
}

export function LayoutSwitch({ layout, choose }: { layout: Layout; choose: (layout: Layout) => void }) {
  return <div className="layout-switch" role="group" aria-label={t('layout')}>
    {LAYOUTS.map(([value, label]) => <button key={value} aria-pressed={layout === value} onClick={() => choose(value)}>{t(label)}</button>)}
  </div>;
}
