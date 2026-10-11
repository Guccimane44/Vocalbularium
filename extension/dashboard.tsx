import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { dialog } from './dialog.ts';
import { SORT_ORDERS } from './sorting.ts';
import { deckColour } from './deck-colour.ts';

type Status = 'completed' | 'loading' | 'failed' | null;

// A page summary: list rows show the main key, never the page's content.
export type DashboardPage = {
  id: string;
  deckId: string;
  selectedText: string | null;
  createdAt: string;
  mainKey: string;
  status: Status;
};

export type DashboardAccount = {
  defaultDeckId: string;
  decks: DashboardDeck[];
  nextCursor?: string | null;
  recentPages: DashboardPage[];
  sequence: number;
};

type DashboardDeck = { id: string; name: string; moduleCount: number; pageCount: number };
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

const descriptions = { completed: 'Completed', loading: 'Pending: generating', failed: 'Failed' };
const paths = {
  completed: ['M5 12l4 4L19 6'],
  loading: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 7v5l3 2'],
  failed: ['M12 3L2 21h20L12 3Z', 'M12 9v5', 'M12 17v1']
};

function StatusIcon({ status, description, id }: { status: Status; description?: string; id?: string }) {
  if (!status) return null;
  const label = description ?? descriptions[status];
  return <span className="state-icon" id={id} role="img" aria-label={label} title={label}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[status].map((data, index) => <path d={data} key={index} />)}
    </svg>
  </span>;
}

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
  }}>Try saving again</button>;
}

function PendingSaveNotices({ local, mutate, reportError }: Pick<DashboardProps, 'local' | 'mutate' | 'reportError'>) {
  const pending = Object.entries(local)
    .filter(([key, item]) => key.startsWith('save-') && isSaveReceipt(item) && item.state !== 'saving')
    .map(([, item]) => item as SaveReceipt);
  return <>{pending.map(item => <div className="notice" key={item.operationId}>
    <p>A change is waiting to be saved to your account.</p>
    <RecoveryButton operationId={item.operationId} mutate={mutate} reportError={reportError} />
  </div>)}</>;
}

function DeckMenu({ deck, account, replacementDecks, replacementCursor, loadDecks, configure, mutate, reportError }:
  Pick<DashboardProps, 'account' | 'loadDecks' | 'configure' | 'mutate' | 'reportError'> &
  { deck: DashboardDeck; replacementDecks: DashboardDeck[]; replacementCursor: string | null }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const close = () => { if (menu.current) menu.current.open = false; summary.current?.focus(); };
  const action = (run: () => Promise<void> | void) => async () => {
    close();
    try { await run(); } catch (error) { reportError(error); }
  };
  const deleteDeck = action(async () => {
    const replacements = deck.id === account.defaultDeckId ? replacementDecks.filter(item => item.id !== deck.id) : [];
    const decision = await dialog({
      title: 'Delete deck?',
      message: `“${deck.name}” and all its pages will be deleted.${replacementDecks.length === 1 && !replacementCursor ? ' A new empty My Deck will replace it.' : ''}`,
      choices: ['Cancel', 'Delete deck'],
      select: replacements.length || replacementCursor ? {
        label: 'New default deck', options: replacements.map(item => ({ value: item.id, label: item.name })),
        cursor: replacementCursor,
        loadMore: async (cursor: string) => {
          const page = await loadDecks(cursor);
          return { options: page.decks.filter(item => item.id !== deck.id).map(item => ({ value: item.id, label: item.name })), nextCursor: page.nextCursor };
        }
      } : undefined
    });
    if (decision.choice !== 'Delete deck') return;
    await mutate({ type: 'delete-deck', payload: { deckId: deck.id, replacementId: decision.value } });
  });
  return <details className="deck-menu" ref={menu}
    onKeyDown={event => {
      if (event.key === 'Escape' && menu.current?.open) { event.preventDefault(); event.stopPropagation(); close(); }
    }}
    onBlur={event => { if (!menu.current?.contains(event.relatedTarget)) menu.current!.open = false; }}>
    <summary ref={summary} aria-label={`Options for ${deck.name}`} data-deck-options={deck.id}>•••</summary>
    <div className="menu-choices">
      <button disabled={deck.id === account.defaultDeckId} onClick={action(() => mutate({ type: 'set-default', deckId: deck.id }))}>Set as default</button>
      <button onClick={action(() => configure(deck.id))}>Configure deck</button>
      <button onClick={deleteDeck}>Delete deck</button>
    </div>
  </details>;
}

function PageRow({ page, index, navigate }: { page: DashboardPage; index: number; navigate: DashboardProps['navigate'] }) {
  const row = useRef<HTMLTableRowElement>(null);
  const stateId = useId();
  const activate = (event: ReactMouseEvent<HTMLElement>) => {
    const selection = window.getSelection();
    if (event.detail && selection && !selection.isCollapsed && row.current?.contains(selection.anchorNode) && row.current.contains(selection.focusNode)) return;
    navigate(`page/${page.id}`);
  };
  return <tr className="page-row state-row" data-page-id={page.id} data-state={page.status ?? 'neutral'} ref={row}
    onClick={event => { if (!(event.target instanceof Element) || !event.target.closest('button')) activate(event); }}>
    <td>{String(index + 1).padStart(3, '0')}</td>
    <td>
      <StatusIcon status={page.status} id={page.status ? stateId : undefined} />
      <button className="entry" aria-describedby={page.status ? stateId : undefined} onClick={activate}>{page.mainKey}</button>
    </td>
  </tr>;
}

function DeckList({ deck, account, navigate, configure, mutate, reportError, loadPages, loadDecks }: Omit<DashboardProps, 'local' | 'deckId' | 'focusedMenu' | 'showPendingSaves' | 'error'> & { deck: DashboardDeck }) {
  const [order, setOrder] = useState(() => localStorage.getItem(`sort-${deck.id}`) ?? 'newest');
  const [pages, setPages] = useState<DashboardPage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setPages([]);
    setLoading(true);
    void loadPages(deck.id, order).then(batch => {
      if (active) { setPages(batch.pages); setCursor(batch.nextCursor); setLoading(false); }
    }).catch(error => { if (active) { setLoading(false); reportError(error); } });
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
  return <>
    <button className="back" onClick={() => navigate('')}>← All decks</button>
    <p className="eyebrow">YOUR COLLECTION</p>
    <h1>{deck.name}</h1>
    <DeckMenu deck={deck} account={account} replacementDecks={account.decks} replacementCursor={account.nextCursor ?? null} loadDecks={loadDecks} configure={configure} mutate={mutate} reportError={reportError} />
    <button className="primary" onClick={() => navigate(`new-page/${deck.id}`)}>Add page manually</button>
    <label htmlFor="page-sort">Sort pages</label>
    <select id="page-sort" value={order} onChange={event => { localStorage.setItem(`sort-${deck.id}`, event.target.value); setOrder(event.target.value); }}>
      {SORT_ORDERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
    </select>
    {!pages.length ? <div className="empty">{loading ? 'Loading pages…' : 'No pages in this deck yet.'}</div> :
      <table className="list"><tbody>
        <tr><th>Index</th><th>Entry</th></tr>
        {pages.map((page, index) => <PageRow page={page} index={index} navigate={navigate} key={page.id} />)}
      </tbody></table>}
    {cursor && <button disabled={loading} onClick={() => void more()}>Load more pages</button>}
  </>;
}

type CaptureEntry = { key: string; text: string; deckId: string; date: string; receipt?: CaptureReceipt; page?: DashboardPage };

// Compact capture times: "now", minutes, today's time, "Yesterday", or the date.
function captureTime(iso: string, now = new Date()) {
  const date = new Date(iso), minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min`;
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86400000);
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function RecentCaptures({ account, local, mutate, reportError }: Pick<DashboardProps, 'account' | 'local' | 'mutate' | 'reportError'>) {
  const receipts = Object.entries(local)
    .filter(([key, item]) => key.startsWith('capture-') && isCaptureReceipt(item))
    .map(([, item]) => item as CaptureReceipt);
  const entries: CaptureEntry[] = [
    ...receipts.filter(item => item.state !== 'saved' || !account.recentPages.some(page => page.id === item.pageId))
      .map(item => ({ key: `receipt-${item.operationId}`, receipt: item, text: item.payload.mainKey, deckId: item.payload.snapshot.id, date: item.createdAt })),
    ...account.recentPages.filter(page => page.selectedText !== null).map(page => ({ key: `page-${page.id}`, page, text: page.selectedText!, deckId: page.deckId, date: page.createdAt }))
  ].sort((a, b) => b.date.localeCompare(a.date));
  return <section className="recent" aria-labelledby="recent-captures">
    <h2 className="section-title" id="recent-captures">Recent captures</h2>
    {entries.length > 0 && <ul className="captures">{entries.map(entry => {
      const state = entry.page?.status ?? (entry.receipt?.state === 'saving' ? 'loading' : entry.receipt?.state === 'pending' ? 'failed' : null);
      const deck = account.decks.find(item => item.id === entry.deckId);
      const pageId = entry.page?.id ?? (entry.receipt?.state === 'saved' ? entry.receipt.pageId : undefined);
      const text = <span className="capture-text">{entry.text}</span>;
      return <li className="capture state-row" data-state={state ?? 'neutral'} key={entry.key}>
        <StatusIcon status={state} description={entry.receipt ? entry.receipt.state === 'saving' ? 'Pending' : entry.receipt.state === 'pending' ? 'Not saved to your account' : undefined : undefined} />
        {pageId ? <a className="capture-link" href={`#page/${pageId}`}>{text}</a> : text}
        <span className="capture-meta">
          {deck && <span className={`capture-deck fam-${deckColour(deck.id)}`}><span className="fam-mark" aria-hidden="true" />{deck.name}</span>}
          <time dateTime={entry.date}>{captureTime(entry.date)}</time>
        </span>
        {entry.receipt?.state === 'pending' && <div className="capture-recovery">
          <p className="muted">Not saved to your account.</p>
          {entry.receipt.error && <p className="error">{entry.receipt.error}</p>}
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
        <h1>Your decks</h1>
        <p className="muted">Keep the words and expressions you want to come back to.</p>
      </div>
      <button className="primary" onClick={() => configure('new')}>Add new deck</button>
    </div>
    <RecentCaptures account={account} local={local} mutate={mutate} reportError={reportError} />
    <div className="grid">
      {decks.map(deck => <article className={`deck fam-${deckColour(deck.id)}`} key={deck.id}>
        <span className="deck-tab" aria-hidden="true" />
        <button className="open" onClick={() => navigate(`deck/${deck.id}`)}>
          <h2>{deck.name}</h2>
          <p className="muted">{deck.pageCount} {deck.pageCount === 1 ? 'page' : 'pages'} · {deck.moduleCount} {deck.moduleCount === 1 ? 'module' : 'modules'}</p>
        </button>
        <footer>
          {deck.id === account.defaultDeckId && <span className="default-label">Default</span>}
          <DeckMenu deck={deck} account={account} replacementDecks={decks} replacementCursor={cursor} loadDecks={loadDecks} configure={configure} mutate={mutate} reportError={reportError} />
        </footer>
      </article>)}
    </div>
    {cursor && <button disabled={loading} onClick={() => void more()}>Load more decks</button>}
  </>;
}

export function Dashboard({ account, local, deckId, focusedMenu, showPendingSaves, error, navigate, configure, mutate, reportError, loadPages, loadDecks }: DashboardProps) {
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>('.deck-menu[open]')) if (!menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
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
