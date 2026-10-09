import { useState } from 'react';
import type { KarteEditorDraft } from '../types/editor-drafts.js';
import type { DashboardKarte } from './dashboard.js';

type Deck = { id: string; name: string };
type Props = {
  karte?: DashboardKarte;
  deck?: Deck;
  draft?: KarteEditorDraft;
  selectedSeiteId?: string;
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
  deleteKarte: () => Promise<void>;
  retrySeite: (seiteId: string) => Promise<void>;
};

function Status({ status, prefix }: { status: string | null; prefix: string }) {
  return status && <span className={`badge status-${status}`}>{prefix + status[0].toUpperCase() + status.slice(1)}</span>;
}

export function KarteView({ karte, deck, draft, selectedSeiteId, isNew, editing, busy, error, pendingSaves, retryPendingSave,
  navigate, begin, persist, save, cancel, discardUnavailable, deleteKarte, retrySeite }: Props) {
  const [retryBusy, setRetryBusy] = useState(false);
  if (!karte || !deck) return <>
    {error && error !== draft?.error && <p className="notice error" role="alert">{error}</p>}
    <h1>Karte unavailable</h1>
    <p>This karte or deck has been deleted.</p>
    {draft && <>
      <p className="notice">Your unsaved text is still here. Copy anything you want to keep before discarding it.</p>
      {Object.values(draft.texts).map((text, index) => <pre key={index}>{text}</pre>)}
      <button onClick={() => void discardUnavailable()}>Discard draft</button>
    </>}
  </>;

  const selected = karte.seites.find(seite => seite.seite_id === selectedSeiteId) ?? karte.seites[0];
  const seiteIndex = karte.seites.indexOf(selected);
  const missingSeites = editing && draft
    ? Object.keys(draft.texts).filter(seiteId => !karte.seites.some(seite => seite.seite_id === seiteId))
    : [];
  return <>
    {error && error !== draft?.error && <p className="notice error" role="alert">{error}</p>}
    <button className="back" onClick={() => navigate(`deck/${deck.id}`)}>← {deck.name}</button>
    <h1>{isNew ? 'A new karte.' : 'Karte content'}</h1>
    <Status status={karte.status} prefix="Karte: " />
    <nav className="seites" aria-label="Karte seites">
      {karte.seites.map((seite, index) => <button key={seite.seite_id}
        aria-current={seite === selected}
        onClick={() => navigate(`${isNew ? 'new-karte' : 'karte'}/${isNew ? deck.id : karte.id}/${seite.seite_id}`)}>
        Seite {index + 1}
      </button>)}
    </nav>
    <section className="karte-seite">
      <Status status={selected.status} prefix="Seite: " />
      {editing && draft ? <>
        <label htmlFor="seite-content">Seite {seiteIndex + 1} content</label>
        <textarea key={selected.seite_id} id="seite-content" rows={12} defaultValue={draft.texts[selected.seite_id] ?? ''}
          readOnly={busy || selected.status === 'loading' || Boolean(draft.pending && !draft.errorCode)}
          onChange={event => { draft.texts[selected.seite_id] = event.target.value; persist(); }} />
        {selected.status === 'loading' && <p className="notice">This seite is generating. Your draft is preserved; save explicitly after generation finishes.</p>}
        {missingSeites.map(seiteId => <div key={seiteId}>
          <p className="notice">A draft seite was removed from the deck. Its unsaved text is preserved below.</p>
          <pre>{draft.texts[seiteId]}</pre>
        </div>)}
        <div className="dialog-actions">
          {!isNew && <button disabled={busy} onClick={() => void deleteKarte()}>Delete karte</button>}
          <button disabled={busy} onClick={() => void cancel()}>Cancel</button>
          <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? 'Try saving again' : 'Save'}</button>
        </div>
        {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
      </> : <>
        {selected.text ? <pre>{selected.text}</pre> :
          <p className="muted">{selected.status === 'loading' ? 'Generating this seite…' : selected.status === 'failed' ? 'Generation failed for this seite.' : 'This seite is empty.'}</p>}
        <div className="dialog-actions">
          <button disabled={selected.status === 'loading'} onClick={begin}>Edit karte manually</button>
          {karte.selected_text !== null && <button disabled={retryBusy || selected.status === 'loading'} onClick={async () => {
            setRetryBusy(true);
            try { await retrySeite(selected.seite_id); } finally { setRetryBusy(false); }
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
