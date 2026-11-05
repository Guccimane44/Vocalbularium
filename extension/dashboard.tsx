import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { dialog } from './dialog.ts';
import { SORT_ORDERS } from './sorting.ts';
import { deckColour } from './deck-colour.ts';
import { mainKeyTier } from './main-key.ts';
import { GeneratingStatus, isLayout, LayoutSwitch, MeaningLine, PageList, SavingStatus, useArrivals } from './page-list.tsx';
import type { Layout, ListPage } from './page-list.tsx';
import { currentLanguage, listFormat, t } from './i18n.ts';
import { familyLabel } from './catalog-text.ts';
import type { ModuleFamily } from '@vocabularium/domain/page-modules';
import { ButtonIcon } from './button-icon.tsx';

// A page summary: list rows show the main key, the first meaning and the
// filled modules, never the page's content.
export type DashboardPage = ListPage & {
  deckId: string;
  selectedText: string | null;
};

export type DashboardAccount = {
  defaultDeckId: string;
  decks: DashboardDeck[];
  nextCursor?: string | null;
  recentPages: DashboardPage[];
  sequence: number;
};

// `families`: the module families its configuration uses, in the catalog's order (0.16.2).
type DashboardDeck = { id: string; name: string; colour?: string | null; moduleCount: number; pageCount: number; families?: readonly string[] };
type PageBatch = { pages: DashboardPage[]; nextCursor: string | null };
type DeckBatch = { decks: DashboardDeck[]; nextCursor: string | null };

type CaptureReceipt = {
  operationId: string;
  state: 'saving' | 'pending' | 'saved';
  createdAt: string;
  pageId?: string;
  error?: string | null;
  payload: { mainKey: string; snapshot: { id: string } };
};

type SaveReceipt = { operationId: string; state: string };
type Command = Record<string, unknown>;

export type DashboardProps = {
  account: DashboardAccount;
  local: Record<string, unknown>;
  deckId: string | null;
  focusedMenu?: string;
  showPendingSaves: boolean;
  error?: string;
  loadPages: (deckId: string, order: string, cursor?: string) => Promise<PageBatch>;
  loadDecks: (cursor: string) => Promise<DeckBatch>;
  navigate: (hash: string) => void;
  configure: (id: string) => void;
  mutate: (command: Command) => Promise<void>;
  reportError: (error: unknown) => void;
};

function isCaptureReceipt(value: unknown): value is CaptureReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<CaptureReceipt>;
  return typeof item.operationId === 'string' && typeof item.createdAt === 'string' &&
    (item.state === 'saving' || item.state === 'pending' || item.state === 'saved') &&
    typeof item.payload?.mainKey === 'string' && typeof item.payload.snapshot?.id === 'string';
}

function isSaveReceipt(value: unknown): value is SaveReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<SaveReceipt>;
  return typeof item.operationId === 'string' && typeof item.state === 'string';
}

function RecoveryButton({ operationId, mutate, reportError }: Pick<DashboardProps, 'mutate' | 'reportError'> & { operationId: string }) {
  const [busy, setBusy] = useState(false);
  return <button disabled={busy} onClick={async () => {
    setBusy(true);
    try { await mutate({ type: 'try-saving-again', operationId }); }
    catch (error) { reportError(error); }
    finally { setBusy(false); }
  }}>{t('common.trySavingAgain')}</button>;
}

function PendingSaveNotices({ local, mutate, reportError }: Pick<DashboardProps, 'local' | 'mutate' | 'reportError'>) {
  const pending = Object.entries(local)
    .filter(([key, item]) => key.startsWith('save-') && isSaveReceipt(item) && item.state !== 'saving')
    .map(([, item]) => item as SaveReceipt);
  return <>{pending.map(item => <div className="notice" key={item.operationId}>
    <p>{t('save.waiting')}</p>
    <RecoveryButton operationId={item.operationId} mutate={mutate} reportError={reportError} />
  </div>)}</>;
}

// A deck's actions as symbols (0.16.2, the accepted canvas; until then a ⋯
// menu): Set as default, a star filled on the default deck; Configure deck, a
// gear; Delete deck, a trash that asks first. On a deck's own page, Add page
// manually leads them as the one primary symbol. Each symbol is named, and
// keeps its name as a tooltip.
function DeckActions({ deck, account, replacementDecks, replacementCursor, loadDecks, configure, mutate, reportError, where, addPage }:
  Pick<DashboardProps, 'account' | 'loadDecks' | 'configure' | 'mutate' | 'reportError'> &
  { deck: DashboardDeck; replacementDecks: DashboardDeck[]; replacementCursor: string | null; where: 'card' | 'head'; addPage?: () => void }) {
  const act = (run: () => Promise<void> | void) => async () => {
    try { await run(); } catch (error) { reportError(error); }
  };
  const isDefault = deck.id === account.defaultDeckId;
  const deleteDeck = act(async () => {
    const replacements = isDefault ? replacementDecks.filter(item => item.id !== deck.id) : [];
    const decision = await dialog({
      title: t('deck.delete.title'),
      message: t(replacementDecks.length === 1 && !replacementCursor ? 'deck.delete.lastMessage' : 'deck.delete.message', { name: deck.name }),
      choices: [t('common.cancel'), t('deck.delete')], danger: true,
      select: replacements.length || replacementCursor ? {
        label: t('deck.delete.newDefault'), options: replacements.map(item => ({ value: item.id, label: item.name })),
        cursor: replacementCursor,
        loadMore: async (cursor: string) => {
          const page = await loadDecks(cursor);
          return { options: page.decks.filter(item => item.id !== deck.id).map(item => ({ value: item.id, label: item.name })), nextCursor: page.nextCursor };
        }
      } : undefined
    });
    if (decision.choice !== t('deck.delete')) return;
    await mutate({ type: 'delete-deck', payload: { deckId: deck.id, replacementId: decision.value } });
  });
  // The focus comes back to the symbol it left once the view redraws (`focusedMenu`).
  const key = (kind: string) => `${deck.id}:${kind}`;
  const symbols = <>
    {isDefault
      ? <span className="deck-star is-default" title={t('deck.isDefault')}><ButtonIcon name="star" />
        {where === 'card' ? t('deck.default') : <span className="visually-hidden">{t('deck.isDefault')}</span>}</span>
      : <button type="button" className="deck-symbol deck-star" aria-label={t('deck.setDefault')} title={t('deck.setDefault')} data-deck-options={key('default')}
        onClick={act(() => mutate({ type: 'set-default', deckId: deck.id }))}><ButtonIcon name="star" /></button>}
    <button type="button" className="deck-symbol deck-configure" aria-label={t('deck.configure')} title={t('deck.configure')} data-deck-options={key('configure')}
      onClick={act(() => configure(deck.id))}><ButtonIcon name="gear" /></button>
    <button type="button" className="deck-symbol deck-delete" aria-label={t('deck.delete')} title={t('deck.delete')} data-deck-options={key('delete')}
      onClick={() => void deleteDeck()}><ButtonIcon name="trash" /></button>
  </>;
  return <div className={`deck-actions deck-actions-${where}`} role="group" aria-label={t('deck.optionsFor', { name: deck.name })}>
    {where === 'head' ? <span className="deck-symbols">{symbols}</span> : symbols}
    {addPage && <button type="button" className="primary deck-add-page" aria-label={t('deck.addPage')} title={t('deck.addPage')} data-deck-options={key('add-page')}
      onClick={addPage}><ButtonIcon name="pagePlus" /></button>}
  </div>;
}

// How long a deck's first batch may take before the list says it is loading.
const SLOW_LOAD_MS = 300;

function storedLayout(deckId: string): Layout {
  try { const value = localStorage.getItem(`layout-${deckId}`); return isLayout(value) ? value : 'list'; }
  catch { return 'list'; }
}

function DeckList({ deck, account, navigate, configure, mutate, reportError, loadPages, loadDecks }: Omit<DashboardProps, 'local' | 'deckId' | 'focusedMenu' | 'showPendingSaves' | 'error'> & { deck: DashboardDeck }) {
  const [order, setOrder] = useState(() => localStorage.getItem(`sort-${deck.id}`) ?? 'newest');
  const [layout, setLayout] = useState(() => storedLayout(deck.id));
  const [pages, setPages] = useState<DashboardPage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Whether the deck's first batch has arrived, and whether it is taking long
  // enough to say so (0.16.1). Until then the list's place stays blank: the
  // dashed box of an empty deck, drawn for a moment on the way back from a
  // page, read as an error. A reload (another order, an account refresh) keeps
  // the list on screen until its new batch replaces it. A deck's list is keyed
  // by the deck, so another deck starts afresh.
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [loaded]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadPages(deck.id, order).then(batch => {
      if (active) { setPages(batch.pages); setCursor(batch.nextCursor); setLoading(false); setLoaded(true); }
    }).catch(error => { if (active) { setLoading(false); setLoaded(true); reportError(error); } });
    return () => { active = false; };
  }, [deck.id, order, account.sequence, loadPages, reportError]);
  async function more() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const batch = await loadPages(deck.id, order, cursor);
      setPages(previous => [...previous, ...batch.pages]); setCursor(batch.nextCursor);
    } catch (error) {
      if ((error as { code?: string }).code === 'stale_cursor') {
        const batch = await loadPages(deck.id, order);
        setPages(batch.pages); setCursor(batch.nextCursor);
      } else reportError(error);
    } finally { setLoading(false); }
  }
  const choose = (value: Layout) => {
    try { localStorage.setItem(`layout-${deck.id}`, value); } catch { /* Remembering is a convenience. */ }
    setLayout(value);
  };
  return <div className={`deck-view fam-${deckColour(deck)}`}>
    {/* Every view below Home leads back up (0.16.2). */}
    <button className="back" onClick={() => navigate('')}>{t('page.back', { deck: t('nav.home') })}</button>
    <div className="page-head">
      <div>
        <h1><span className="fam-mark deck-mark" aria-hidden="true" /><bdi>{deck.name}</bdi></h1>
        <p className="muted">{t('deck.pageCount', { count: deck.pageCount })}</p>
      </div>
      <div className="head-actions">
        <DeckActions where="head" deck={deck} account={account} replacementDecks={account.decks} replacementCursor={account.nextCursor ?? null} loadDecks={loadDecks}
          configure={configure} mutate={mutate} reportError={reportError} addPage={() => navigate(`new-page/${deck.id}`)} />
      </div>
    </div>
    <div className="list-toolbar">
      <label htmlFor="page-sort">{t('deck.sortPages')}</label>
      <select id="page-sort" value={order} onChange={event => { localStorage.setItem(`sort-${deck.id}`, event.target.value); setOrder(event.target.value); }}>
        {SORT_ORDERS.map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}
      </select>
      <LayoutSwitch layout={layout} choose={choose} />
    </div>
    {pages.length ? <PageList pages={pages} layout={layout} order={order} navigate={navigate} />
      : !loaded ? <p className="list-loading" role="status">{slow ? t('deck.loadingPages') : ''}</p>
      : <div className="empty">{t('deck.noPages')}</div>}
    {cursor && <button className="load-more" disabled={loading} onClick={() => void more()}>{t('deck.morePages')}</button>}
  </div>;
}

type CaptureEntry = { key: string; text: string; deckId: string; date: string; receipt?: CaptureReceipt; page?: DashboardPage };

// Compact capture times: "now", minutes, today's time, "Yesterday", or the date.
function captureTime(iso: string, now = new Date()) {
  const date = new Date(iso), minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return t('time.now');
  if (minutes < 60) return t('time.minutes', { count: minutes });
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86400000);
  if (days === 0) return date.toLocaleTimeString(currentLanguage(), { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return t('time.yesterday');
  return date.toLocaleDateString(currentLanguage(), { day: 'numeric', month: 'short' });
}

function RecentCaptures({ account, local, navigate, mutate, reportError }: Pick<DashboardProps, 'account' | 'local' | 'navigate' | 'mutate' | 'reportError'>) {
  const receipts = Object.entries(local)
    .filter(([key, item]) => key.startsWith('capture-') && isCaptureReceipt(item))
    .map(([, item]) => item as CaptureReceipt);
  const entries: CaptureEntry[] = [
    ...receipts.filter(item => item.state !== 'saved' || !account.recentPages.some(page => page.id === item.pageId))
      .map(item => ({ key: `receipt-${item.operationId}`, receipt: item, text: item.payload.mainKey, deckId: item.payload.snapshot.id, date: item.createdAt })),
    ...account.recentPages.filter(page => page.selectedText !== null).map(page => ({ key: `page-${page.id}`, page, text: page.selectedText!, deckId: page.deckId, date: page.createdAt }))
  ].sort((a, b) => b.date.localeCompare(a.date));
  // A new capture arrives as its receipt; the page that replaces it is not a second arrival.
  const arrived = useArrivals(entries.filter(entry => entry.receipt).map(entry => entry.key), { appended: true });
  return <section className="recent" aria-labelledby="recent-captures">
    <h2 className="section-title" id="recent-captures">{t('dashboard.recentCaptures')}</h2>
    {entries.length > 0 && <ul className="captures">{entries.map(entry => {
      const state = entry.page ? entry.page.status ?? 'neutral'
        : entry.receipt?.state === 'saving' ? 'saving' : entry.receipt?.state === 'pending' ? 'unsaved' : 'loading';
      const deck = account.decks.find(item => item.id === entry.deckId);
      const pageId = entry.page?.id ?? (entry.receipt?.state === 'saved' ? entry.receipt.pageId : undefined);
      const text = <span className="capture-text" dir="auto" data-tier={mainKeyTier(entry.text)}>{entry.text}</span>;
      let line: ReactNode = null;
      if (entry.page) line = <MeaningLine page={{ ...entry.page, mainKey: entry.text }} navigate={navigate} key={entry.page.status ?? 'none'} />;
      else if (entry.receipt?.state === 'saving') line = <span className="meaning-line"><SavingStatus /></span>;
      else if (entry.receipt?.state === 'saved') line = <span className="meaning-line"><GeneratingStatus /></span>;
      return <li className="capture" data-state={state} key={entry.key} data-arrived={arrived(entry.key)}>
        <span className="capture-body">
          {pageId ? <a className="capture-link" href={`#page/${pageId}`}>{text}</a> : text}
          {line}
        </span>
        <span className="capture-meta">
          {deck && <span className={`capture-deck fam-${deckColour(deck)}`}><span className="fam-mark" aria-hidden="true" />{deck.name}</span>}
          <time dateTime={entry.date}>{captureTime(entry.date)}</time>
        </span>
        {entry.receipt?.state === 'pending' && <div className="capture-recovery">
          <span className="list-status" data-status="failed">{t('status.notSaved')}</span>
          {entry.receipt.error && <span className="error">{entry.receipt.error}</span>}
          <RecoveryButton operationId={entry.receipt.operationId} mutate={mutate} reportError={reportError} />
        </div>}
      </li>;
    })}</ul>}
  </section>;
}

function DeckGrid({ account, local, navigate, configure, mutate, reportError, loadDecks }: Pick<DashboardProps, 'account' | 'local' | 'navigate' | 'configure' | 'mutate' | 'reportError' | 'loadDecks'>) {
  const [additional, setAdditional] = useState<DashboardDeck[]>([]);
  const [cursor, setCursor] = useState(account.nextCursor ?? null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setAdditional([]); setCursor(account.nextCursor ?? null); }, [account.sequence, account.nextCursor]);
  const decks = [...account.decks, ...additional];
  async function more() {
    if (!cursor || loading) return;
    setLoading(true);
    try { const page = await loadDecks(cursor); setAdditional(value => [...value, ...page.decks]); setCursor(page.nextCursor); }
    catch (error) { reportError(error); }
    finally { setLoading(false); }
  }
  return <>
    <div className="page-head">
      <div>
        <h1>{t('dashboard.title')}</h1>
      </div>
      <button className="primary" onClick={() => configure('new')}><ButtonIcon name="plus" />{t('dashboard.addDeck')}</button>
    </div>
    <div className="grid">
      {/* A deck as a card (0.16.2, the accepted canvas, A1): behind its top edge a
          little module card per family its modules come from, which rise and lean
          apart while the deck is pointed at or focused; its actions as symbols. */}
      {decks.map(deck => <div className={`deck-slot fam-${deckColour(deck)}`} key={deck.id}>
        {(deck.families?.length ?? 0) > 0 && <span className="deck-families" role="img"
          aria-label={t('deck.families', { families: listFormat((deck.families ?? []).map(family => familyLabel(family as ModuleFamily))) })}>
          {(deck.families ?? []).map((family, index) => <span key={family} className={`deck-family fam-${family}`} style={{ '--i': index } as CSSProperties} />)}
        </span>}
        <article className="deck">
          <button className="open" onClick={() => navigate(`deck/${deck.id}`)}>
            <h2 dir="auto">{deck.name}</h2>
            <p className="muted">{t('deck.pageCount', { count: deck.pageCount })} · {t('deck.moduleCount', { count: deck.moduleCount })}</p>
          </button>
          <footer>
            <DeckActions where="card" deck={deck} account={account} replacementDecks={decks} replacementCursor={cursor} loadDecks={loadDecks}
              configure={configure} mutate={mutate} reportError={reportError} />
          </footer>
        </article>
      </div>)}
    </div>
    {cursor && <button className="load-more-decks" disabled={loading} onClick={() => void more()}>{t('dashboard.moreDecks')}</button>}
    {/* Since 0.13.3 (D23) the decks come first and the recent captures follow them. */}
    <RecentCaptures account={account} local={local} navigate={navigate} mutate={mutate} reportError={reportError} />
  </>;
}

export function Dashboard({ account, local, deckId, focusedMenu, showPendingSaves, error, navigate, configure, mutate, reportError, loadPages, loadDecks }: DashboardProps) {
  useLayoutEffect(() => {
    if (focusedMenu) [...document.querySelectorAll<HTMLElement>('[data-deck-options]')].find(node => node.dataset.deckOptions === focusedMenu)?.focus();
  }, [account, deckId, focusedMenu]);
  const deck = deckId ? account.decks.find(item => item.id === deckId) : undefined;
  let content: ReactNode;
  if (deck) content = <DeckList key={deck.id} deck={deck} account={account} navigate={navigate} configure={configure} mutate={mutate} reportError={reportError} loadPages={loadPages} loadDecks={loadDecks} />;
  else content = <DeckGrid account={account} local={local} navigate={navigate} configure={configure} mutate={mutate} reportError={reportError} loadDecks={loadDecks} />;
  return <>
    {error && <p className="notice error" role="alert">{error}</p>}
    {content}
    {showPendingSaves && <PendingSaveNotices local={local} mutate={mutate} reportError={reportError} />}
  </>;
}
