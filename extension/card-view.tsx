import { useState } from 'react';
import type { CardEditorDraft } from '../types/editor-drafts.js';
import type { DashboardCard } from './dashboard.js';

type Deck = { id: string; name: string };
type Props = {
  card?: DashboardCard;
  deck?: Deck;
  draft?: CardEditorDraft;
  selectedPageId?: string;
  isNew: boolean;
  editing: boolean;
  busy: boolean;
  error?: string;
  pendingSaves: Array<{ operationId: string }>;
  retryPendingSave: (operationId: string) => Promise<void>;
  navigate: (hash: string) => void;
  begin: () => void;
  persist: () => void;
  save: () => Promise<boolean>;
  cancel: () => Promise<void>;
  discardUnavailable: () => Promise<void>;
  deleteCard: () => Promise<void>;
  retryPage: (pageId: string) => Promise<void>;
};

function Status({ status, prefix }: { status: string | null; prefix: string }) {
  return status && <span className={`badge status-${status}`}>{prefix + status[0].toUpperCase() + status.slice(1)}</span>;
}

export function CardView({ card, deck, draft, selectedPageId, isNew, editing, busy, error, pendingSaves, retryPendingSave,
  navigate, begin, persist, save, cancel, discardUnavailable, deleteCard, retryPage }: Props) {
  const [retryBusy, setRetryBusy] = useState(false);
  if (!card || !deck) return <>
    <h1>Card unavailable</h1>
    <p>This card or deck has been deleted.</p>
    {draft && <>
      <p className="notice">Your unsaved text is still here. Copy anything you want to keep before discarding it.</p>
      {Object.values(draft.texts).map((text, index) => <pre key={index}>{text}</pre>)}
      <button onClick={() => void discardUnavailable()}>Discard draft</button>
    </>}
  </>;

  const selected = card.pages.find(page => page.page_id === selectedPageId) ?? card.pages[0];
  const pageIndex = card.pages.indexOf(selected);
  const missingPages = editing && draft
    ? Object.keys(draft.texts).filter(pageId => !card.pages.some(page => page.page_id === pageId))
    : [];
  return <>
    {error && <p className="notice error" role="alert">{error}</p>}
    <button className="back" onClick={() => navigate(`deck/${deck.id}`)}>← {deck.name}</button>
    <h1>{isNew ? 'A new card.' : 'Card content'}</h1>
    <Status status={card.status} prefix="Card: " />
    <nav className="pages" aria-label="Card pages">
      {card.pages.map((page, index) => <button key={page.page_id}
        aria-current={page === selected}
        onClick={() => navigate(`${isNew ? 'new-card' : 'card'}/${isNew ? deck.id : card.id}/${page.page_id}`)}>
        Page {index + 1}
      </button>)}
    </nav>
    <section className="card-page">
      <Status status={selected.status} prefix="Page: " />
      {editing && draft ? <>
        <label htmlFor="page-content">Page {pageIndex + 1} content</label>
        <textarea key={selected.page_id} id="page-content" rows={12} defaultValue={draft.texts[selected.page_id] ?? ''}
          readOnly={busy || selected.status === 'loading' || Boolean(draft.pending && !draft.errorCode)}
          onChange={event => { draft.texts[selected.page_id] = event.target.value; persist(); }} />
        {selected.status === 'loading' && <p className="notice">This page is generating. Your draft is preserved; save explicitly after generation finishes.</p>}
        {missingPages.map(pageId => <div key={pageId}>
          <p className="notice">A draft page was removed from the deck. Its unsaved text is preserved below.</p>
          <pre>{draft.texts[pageId]}</pre>
        </div>)}
        <div className="dialog-actions">
          {!isNew && <button disabled={busy} onClick={() => void deleteCard()}>Delete card</button>}
          <button disabled={busy} onClick={() => void cancel()}>Cancel</button>
          <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? 'Try saving again' : 'Save'}</button>
        </div>
        {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
      </> : <>
        {selected.text ? <pre>{selected.text}</pre> :
          <p className="muted">{selected.status === 'loading' ? 'Generating this page…' : selected.status === 'failed' ? 'Generation failed for this page.' : 'This page is empty.'}</p>}
        <div className="dialog-actions">
          <button disabled={selected.status === 'loading'} onClick={begin}>Edit card manually</button>
          {card.selected_text !== null && <button disabled={retryBusy || selected.status === 'loading'} onClick={async () => {
            setRetryBusy(true);
            try { await retryPage(selected.page_id); } finally { setRetryBusy(false); }
          }}>Retry</button>}
        </div>
      </>}
    </section>
    {!editing && pendingSaves.map(item => <div className="notice" key={item.operationId}>
      <p>A change is waiting to be saved to your account.</p>
      <button onClick={() => void retryPendingSave(item.operationId)}>Try saving again</button>
    </div>)}
  </>;
}
