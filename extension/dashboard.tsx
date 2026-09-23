import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { DeckLayout } from '@vocabularium/contracts';
import { dialog } from './dialog.js';
import { SORT_ORDERS, sortCards } from './sorting.js';

type Status = 'completed' | 'loading' | 'failed' | null;

export type DashboardCard = {
  id: string;
  deck_id: string;
  selected_text: string | null;
  created_at: string;
  status: Status;
  pages: Array<{ page_id: string; text: string; status: Status }>;
};

export type DashboardAccount = {
  defaultDeckId: string;
  decks: DashboardDeck[];
  cards: DashboardCard[];
};

type DashboardDeck = DeckLayout & { id: string };

type CaptureReceipt = {
  operationId: string;
  state: 'saving' | 'pending' | 'saved';
  createdAt: string;
  error?: string | null;
  payload: { selectedText: string; snapshot: { id: string } };
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
    typeof item.payload?.selectedText === 'string' && typeof item.payload.snapshot?.id === 'string';
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

function DeckMenu({ deck, account, configure, mutate, reportError }: Pick<DashboardProps, 'account' | 'configure' | 'mutate' | 'reportError'> & { deck: DashboardDeck }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const close = () => { if (menu.current) menu.current.open = false; summary.current?.focus(); };
  const action = (run: () => Promise<void> | void) => async () => {
    close();
    try { await run(); } catch (error) { reportError(error); }
  };
  const deleteDeck = action(async () => {
    const replacements = deck.id === account.defaultDeckId ? account.decks.filter(item => item.id !== deck.id) : [];
    const decision = await dialog({
      title: 'Delete deck?',
      message: `“${deck.name}” and all its cards will be deleted.${account.decks.length === 1 ? ' A new empty My Deck will replace it.' : ''}`,
      choices: ['Cancel', 'Delete deck'],
      select: replacements.length ? { label: 'New default deck', options: replacements.map(item => ({ value: item.id, label: item.name })) } : undefined
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

function CardRow({ card, index, navigate }: { card: DashboardCard; index: number; navigate: DashboardProps['navigate'] }) {
  const row = useRef<HTMLTableRowElement>(null);
  const stateId = useId();
  const activate = (event: ReactMouseEvent<HTMLElement>) => {
    const selection = window.getSelection();
    if (event.detail && selection && !selection.isCollapsed && row.current?.contains(selection.anchorNode) && row.current.contains(selection.focusNode)) return;
    navigate(`card/${card.id}`);
  };
  return <tr className="card-row state-row" data-card-id={card.id} data-state={card.status ?? 'neutral'} ref={row}
    onClick={event => { if (!(event.target instanceof Element) || !event.target.closest('button')) activate(event); }}>
    <td>{String(index + 1).padStart(3, '0')}</td>
    <td>
      <StatusIcon status={card.status} id={card.status ? stateId : undefined} />
      <button className="entry" aria-describedby={card.status ? stateId : undefined} onClick={activate}>{card.pages[0]?.text || 'Empty front page'}</button>
    </td>
  </tr>;
}

function DeckList({ deck, account, navigate, configure, mutate, reportError }: Omit<DashboardProps, 'local' | 'deckId' | 'focusedMenu' | 'showPendingSaves' | 'error'> & { deck: DashboardDeck }) {
  const [order, setOrder] = useState(() => localStorage.getItem(`sort-${deck.id}`) ?? 'newest');
  const cards = sortCards(account.cards.filter(card => card.deck_id === deck.id), order) as DashboardCard[];
  return <>
    <button className="back" onClick={() => navigate('')}>← All decks</button>
    <p className="eyebrow">YOUR COLLECTION</p>
    <h1>{deck.name}</h1>
    <DeckMenu deck={deck} account={account} configure={configure} mutate={mutate} reportError={reportError} />
    <button className="primary" onClick={() => navigate(`new-card/${deck.id}`)}>Add card manually</button>
    <label htmlFor="card-sort">Sort cards</label>
    <select id="card-sort" value={order} onChange={event => { localStorage.setItem(`sort-${deck.id}`, event.target.value); setOrder(event.target.value); }}>
      {SORT_ORDERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
    </select>
    {!cards.length ? <div className="empty">No cards in this deck yet.</div> :
      <table className="list"><tbody>
        <tr><th>Index</th><th>Entry</th></tr>
        {cards.map((card, index) => <CardRow card={card} index={index} navigate={navigate} key={card.id} />)}
      </tbody></table>}
  </>;
}

type CaptureEntry = { key: string; text: string; deckId: string; date: string; receipt?: CaptureReceipt; card?: DashboardCard };

function RecentCaptures({ account, local, navigate, mutate, reportError }: Pick<DashboardProps, 'account' | 'local' | 'navigate' | 'mutate' | 'reportError'>) {
  const receipts = Object.entries(local)
    .filter(([key, item]) => key.startsWith('capture-') && isCaptureReceipt(item))
    .map(([, item]) => item as CaptureReceipt);
  const entries: CaptureEntry[] = [
    ...receipts.filter(item => item.state !== 'saved').map(item => ({ key: `receipt-${item.operationId}`, receipt: item, text: item.payload.selectedText, deckId: item.payload.snapshot.id, date: item.createdAt })),
    ...account.cards.filter(card => card.selected_text !== null).map(card => ({ key: `card-${card.id}`, card, text: card.selected_text!, deckId: card.deck_id, date: card.created_at }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  return <>
    <h2 className="section-title">Recent captures</h2>
    {entries.map(entry => {
      const state = entry.card?.status ?? (entry.receipt?.state === 'saving' ? 'loading' : entry.receipt ? 'failed' : null);
      const deck = account.decks.find(item => item.id === entry.deckId);
      return <article className="capture state-row" data-state={state ?? 'neutral'} key={entry.key}>
        <StatusIcon status={state} description={entry.receipt ? entry.receipt.state === 'saving' ? 'Pending' : 'Not saved to your account' : undefined} />
        <p className="capture-text">{entry.text}</p>
        {deck && <button onClick={() => navigate(`deck/${deck.id}`)}>{deck.name}</button>}
        {entry.card ? <button onClick={() => navigate(`card/${entry.card!.id}`)}>Open card</button> : <>
          {entry.receipt?.state !== 'saving' && <p className="muted">Not saved to your account.</p>}
          {entry.receipt?.error && <p className="error">{entry.receipt.error}</p>}
          {entry.receipt?.state === 'pending' && <RecoveryButton operationId={entry.receipt.operationId} mutate={mutate} reportError={reportError} />}
        </>}
      </article>;
    })}
  </>;
}

function DeckGrid({ account, local, navigate, configure, mutate, reportError }: Pick<DashboardProps, 'account' | 'local' | 'navigate' | 'configure' | 'mutate' | 'reportError'>) {
  return <>
    <h1>Your decks.</h1>
    <p className="muted">Keep the words and expressions you want to come back to.</p>
    <button className="primary" onClick={() => configure('new')}>Add new deck</button>
    <div className="grid">
      {account.decks.map(deck => <article className="deck" key={deck.id}>
        <button className="open" onClick={() => navigate(`deck/${deck.id}`)}>
          <h2>{deck.name}</h2>
          <p className="muted">{account.cards.filter(card => card.deck_id === deck.id).length} cards · {deck.pages.length} pages</p>
        </button>
        <footer>
          {deck.id === account.defaultDeckId && <span className="badge">DEFAULT DECK</span>}
          <DeckMenu deck={deck} account={account} configure={configure} mutate={mutate} reportError={reportError} />
        </footer>
      </article>)}
    </div>
    <RecentCaptures account={account} local={local} navigate={navigate} mutate={mutate} reportError={reportError} />
  </>;
}

export function Dashboard({ account, local, deckId, focusedMenu, showPendingSaves, error, navigate, configure, mutate, reportError }: DashboardProps) {
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
  if (deck) content = <DeckList key={deck.id} deck={deck} account={account} navigate={navigate} configure={configure} mutate={mutate} reportError={reportError} />;
  else content = <DeckGrid account={account} local={local} navigate={navigate} configure={configure} mutate={mutate} reportError={reportError} />;
  return <>
    {error && <p className="notice error" role="alert">{error}</p>}
    {content}
    {showPendingSaves && <PendingSaveNotices local={local} mutate={mutate} reportError={reportError} />}
  </>;
}
