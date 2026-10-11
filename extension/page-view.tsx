import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Component, GenerationTarget, ModuleInstance, Page } from '@vocabularium/contracts';
import { isContentType } from '@vocabularium/domain/page-modules';
import { blockText, mainKeyOf } from '@vocabularium/domain/pages';
import type { PageEditorDraft } from '../types/editor-drafts.js';
import { moduleLabel, PinMark, ShapingArea } from './shaping.tsx';

type Deck = { id: string; name: string; modules: ModuleInstance[] };
type Props = {
  page?: Page;
  deck?: Deck;
  draft?: PageEditorDraft;
  isNew: boolean;
  editing: boolean;
  busy: boolean;
  error?: string;
  pendingSaves: Array<{ operationId: string }>;
  retryPendingSave: (operationId: string) => Promise<void>;
  navigate: (hash: string) => void;
  begin: (componentId: string) => void;
  persist: () => void;
  redraw: () => void;
  save: () => Promise<boolean>;
  cancel: () => Promise<void>;
  discardUnavailable: () => Promise<void>;
  deletePage: () => Promise<void>;
  generate: (target: GenerationTarget) => Promise<void>;
  addModule: (type: string, position?: number) => Promise<boolean>;
  moveComponent: (componentId: string, position: number) => Promise<boolean>;
  deleteComponent: (component: Component) => Promise<boolean | void>;
};

const capitalized = (status: string) => status[0].toUpperCase() + status.slice(1);
function Status({ status, prefix }: { status: string | null; prefix: string }) {
  return status && <span className={`badge status-${status}`}>{prefix + capitalized(status)}</span>;
}

function TextField({ id, labelText, value, readOnly, multiline = true, onChange }:
  { id: string; labelText: string; value: string; readOnly: boolean; multiline?: boolean; onChange: (value: string) => void }) {
  return <div className="component-field">
    <label htmlFor={id}>{labelText}</label>
    {multiline
      ? <textarea id={id} rows={6} defaultValue={value} readOnly={readOnly} onChange={event => onChange(event.target.value)} />
      : <input id={id} defaultValue={value} readOnly={readOnly} onChange={event => onChange(event.target.value)} />}
  </div>;
}

// A new page starts with the deck's modules: the user fills the main key and
// any Context and Text; content modules wait until generated.
function NewPageEditor({ draft, deck, busy, persist, save, cancel }: Pick<Props, 'persist' | 'save' | 'cancel' | 'busy'> & { draft: PageEditorDraft; deck: Deck }) {
  const locked = busy || Boolean(draft.pending && !draft.errorCode);
  const inputs = deck.modules.filter(module => module.type === 'context' || module.type === 'text');
  const content = deck.modules.filter(module => isContentType(module.type));
  return <section className="page-components">
    <TextField id="main-key" labelText="Main key" value={draft.mainKey ?? ''} readOnly={locked} multiline={false}
      onChange={value => { draft.mainKey = value; persist(); }} />
    {inputs.map(module => <TextField key={module.id} id={`input-${module.id}`} value={draft.inputs?.[module.id] ?? ''} readOnly={locked}
      labelText={module.type === 'context' ? 'Context (optional)' : moduleLabel(module.type)}
      onChange={value => { draft.inputs = { ...draft.inputs, [module.id]: value }; persist(); }} />)}
    {content.length > 0 && <p className="muted">Saving does not generate. The page also gets {content.map(module => moduleLabel(module.type)).join(', ')}; use Generate missing after saving to fill them from the main key.</p>}
    <div className="dialog-actions">
      <button disabled={busy} onClick={() => void cancel()}>Cancel</button>
      <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? 'Try saving again' : 'Save'}</button>
    </div>
    {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
  </section>;
}

function ComponentBody({ item, title, editable, draft, locked, persist }: {
  item: Component; title: string; editable: boolean; draft?: PageEditorDraft; locked: boolean; persist: () => void;
}) {
  const text = blockText(item.content);
  if (editable && draft) return <>
    <TextField id={`component-${item.id}`} labelText={`Edit ${title}`} value={draft.texts[item.id]}
      readOnly={locked || item.status === 'loading'} multiline={item.moduleType !== 'main-key'}
      onChange={value => { draft.texts[item.id] = value; persist(); }} />
    {item.status === 'loading' && <p className="notice">This component is generating. Your draft is preserved; save explicitly after generation finishes.</p>}
  </>;
  if (text) return <pre>{text}</pre>;
  if (item.status === 'loading') return <p className="muted">Generating…</p>;
  if (item.status === 'failed') return <p className="muted">Generation failed.</p>;
  if (isContentType(item.moduleType) && item.attemptId === null) return <p className="muted">Not generated yet.</p>;
  return <p className="muted">Empty.</p>;
}

export function PageView({ page, deck, draft, isNew, editing, busy, error, pendingSaves, retryPendingSave,
  navigate, begin, persist, save, cancel, discardUnavailable, deletePage, generate, addModule, moveComponent, deleteComponent }: Props) {
  const [working, setWorking] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    try { await action(); } finally { setWorking(false); }
  };
  const notice = error && error !== draft?.error && <p className="notice error" role="alert">{error}</p>;
  if (!deck || (!page && !isNew)) return <>
    {notice}
    <h1>Page unavailable</h1>
    <p>This page or deck has been deleted.</p>
    {draft && <>
      <p className="notice">Your unsaved text is still here. Copy anything you want to keep before discarding it.</p>
      {[draft.mainKey, ...Object.values(draft.inputs ?? {}), ...Object.values(draft.texts)].filter(Boolean).map((text, index) => <pre key={index}>{text}</pre>)}
      <button onClick={() => void discardUnavailable()}>Discard draft</button>
    </>}
  </>;
  const back = <button className="back" onClick={() => navigate(`deck/${deck.id}`)}>← {deck.name}</button>;
  if (isNew || !page) return <>
    {notice}{back}
    <h1>A new page.</h1>
    {draft && <NewPageEditor draft={draft} deck={deck} busy={busy} persist={persist} save={save} cancel={cancel} />}
  </>;

  const [key, ...rest] = page.components;
  const locked = busy || Boolean(draft?.pending && !draft.errorCode);
  const editingId = editing ? draft?.componentId : undefined;
  // Shaping waits while a card is being edited; its Save and Cancel are right there.
  const disabled = Boolean(editingId) || busy;
  const known = new Set(page.components.map(item => item.id));
  const lost = editing && draft ? Object.keys(draft.texts).filter(id => !known.has(id)) : [];
  const items = rest.map(item => ({ id: item.id, label: moduleLabel(item.moduleType), component: item }));

  // One card: its header (drag handle, label, status) and its own actions.
  // Editing is one card at a time; Save and Cancel live in that card.
  const card = (item: Component, title: string, handle: ReactNode) => {
    const generated = isContentType(item.moduleType);
    const editingThis = editingId === item.id;
    const firstRun = generated && item.attemptId === null && !blockText(item.content);
    return <article className={`component${generated && item.attemptId === null ? ' missing' : ''}`} data-component-id={item.id} data-type={item.moduleType}>
      <div className="component-header">
        {handle}
        <h2>{title}</h2>
        <Status status={item.status} prefix="" />
      </div>
      <ComponentBody item={item} title={title} editable={editingThis} draft={draft} locked={locked} persist={persist} />
      {editingThis && draft ? <>
        <div className="component-tools">
          <button disabled={busy} onClick={() => void cancel()}>Cancel</button>
          <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? 'Try saving again' : 'Save'}</button>
        </div>
        {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
      </> : <div className="component-tools">
        <button aria-label={`Edit ${title}`} disabled={Boolean(editingId) || item.status === 'loading'} onClick={() => begin(item.id)}>Edit</button>
        {generated && <button aria-label={`${firstRun ? 'Generate' : 'Retry'} ${title}`} disabled={working || Boolean(editingId) || item.status === 'loading'}
          onClick={() => void run(() => generate({ scope: 'component', componentId: item.id }))}>{firstRun ? 'Generate' : 'Retry'}</button>}
        {item.moduleType !== 'main-key' && <button aria-label={`Delete ${title}`} disabled={disabled || working || item.status === 'loading'}
          onClick={() => void run(async () => { await deleteComponent(item); })}>Delete</button>}
      </div>}
    </article>;
  };

  return <>
    {notice}{back}
    <div className="page-header">
      <h1>{mainKeyOf(page.components)}</h1>
      <button disabled={busy || Boolean(editingId)} onClick={() => void deletePage()}>Delete page</button>
    </div>
    <Status status={page.status} prefix="Page: " />
    <ShapingArea items={items} types={page.components.map(item => item.moduleType)} disabled={disabled}
      label="Components" where="the page"
      pinned={card(key, 'Main key', <PinMark />)}
      onAdd={(type, index) => addModule(type, index + 1)}
      onMove={(id, index) => moveComponent(id, index + 1)}
      renderItem={(item, handle) => card(item.component, item.label, handle)} />
    {lost.map(id => <div key={id}>
      <p className="notice">The component you were editing no longer exists. Its unsaved text is preserved below.</p>
      <pre>{draft!.texts[id]}</pre>
      <button onClick={() => void cancel()}>Discard draft</button>
    </div>)}
    {!editingId && pendingSaves.map(item => <div className="notice" key={item.operationId}>
      <p>A change is waiting to be saved to your account.</p>
      <button onClick={() => void retryPendingSave(item.operationId)}>Try saving again</button>
    </div>)}
  </>;
}
