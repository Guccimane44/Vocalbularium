import { useState } from 'react';
import type { Component, ContentModuleInstance, GenerationTarget, Page } from '@vocabularium/contracts';
import { MODULES } from '@vocabularium/domain/modules';
import type { ModuleType } from '@vocabularium/domain/modules';
import { blockText, defaultView } from '@vocabularium/domain/pages';
import type { MissingComponent } from '@vocabularium/domain/pages';
import type { PageEditorDraft } from '../types/editor-drafts.js';

type Deck = { id: string; name: string; modules: ContentModuleInstance[] };
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
  begin: () => void;
  persist: () => void;
  redraw: () => void;
  save: () => Promise<boolean>;
  cancel: () => Promise<void>;
  discardUnavailable: () => Promise<void>;
  deletePage: () => Promise<void>;
  generate: (target: GenerationTarget) => Promise<void>;
};

const capitalized = (status: string) => status[0].toUpperCase() + status.slice(1);
function Status({ status, prefix }: { status: string | null; prefix: string }) {
  return status && <span className={`badge status-${status}`}>{prefix + capitalized(status)}</span>;
}

function label(item: Component | MissingComponent, deck: Deck): string {
  if (item.kind === 'main_key') return 'Main key';
  if (item.kind === 'context') return 'Context';
  if (item.kind === 'manual') return 'Your text';
  const module = deck.modules.find(module => module.id === item.moduleInstanceId);
  return module ? MODULES[module.type as ModuleType]?.label ?? module.type : 'Removed module';
}
const isMissing = (item: Component | MissingComponent): item is MissingComponent => item.kind === 'missing';

function TextField({ id, labelText, value, readOnly, multiline = true, onChange }:
  { id: string; labelText: string; value: string; readOnly: boolean; multiline?: boolean; onChange: (value: string) => void }) {
  return <div className="component-field">
    <label htmlFor={id}>{labelText}</label>
    {multiline
      ? <textarea id={id} rows={6} defaultValue={value} readOnly={readOnly} onChange={event => onChange(event.target.value)} />
      : <input id={id} defaultValue={value} readOnly={readOnly} onChange={event => onChange(event.target.value)} />}
  </div>;
}

function NewPageEditor({ draft, deck, busy, persist, redraw, save, cancel }: Pick<Props, 'persist' | 'redraw' | 'save' | 'cancel' | 'busy'> & { draft: PageEditorDraft; deck: Deck }) {
  const locked = busy || Boolean(draft.pending && !draft.errorCode);
  return <section className="page-components">
    <TextField id="main-key" labelText="Main key" value={draft.mainKey ?? ''} readOnly={locked} multiline={false}
      onChange={value => { draft.mainKey = value; persist(); }} />
    <TextField id="context" labelText="Context (optional)" value={draft.context ?? ''} readOnly={locked}
      onChange={value => { draft.context = value; persist(); }} />
    {draft.added.map((text, index) => <TextField key={index} id={`added-${index}`} labelText="Your text" value={text} readOnly={locked}
      onChange={value => { draft.added[index] = value; persist(); }} />)}
    <button disabled={locked} onClick={() => { draft.added.push(''); persist(); redraw(); }}>Add your own text</button>
    <p className="muted">Saving does not generate. After saving, use Generate to fill {deck.name}’s modules from the main key.</p>
    <div className="dialog-actions">
      <button disabled={busy} onClick={() => void cancel()}>Cancel</button>
      <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? 'Try saving again' : 'Save'}</button>
    </div>
    {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
  </section>;
}

export function PageView({ page, deck, draft, isNew, editing, busy, error, pendingSaves, retryPendingSave,
  navigate, begin, persist, redraw, save, cancel, discardUnavailable, deletePage, generate }: Props) {
  const [generating, setGenerating] = useState(false);
  const run = async (target: GenerationTarget) => {
    setGenerating(true);
    try { await generate(target); } finally { setGenerating(false); }
  };
  const notice = error && error !== draft?.error && <p className="notice error" role="alert">{error}</p>;
  if (!deck || (!page && !isNew)) return <>
    {notice}
    <h1>Page unavailable</h1>
    <p>This page or deck has been deleted.</p>
    {draft && <>
      <p className="notice">Your unsaved text is still here. Copy anything you want to keep before discarding it.</p>
      {[draft.mainKey, draft.context, ...Object.values(draft.texts), ...draft.added].filter(Boolean).map((text, index) => <pre key={index}>{text}</pre>)}
      <button onClick={() => void discardUnavailable()}>Discard draft</button>
    </>}
  </>;
  const back = <button className="back" onClick={() => navigate(`deck/${deck.id}`)}>← {deck.name}</button>;
  if (isNew || !page) return <>
    {notice}{back}
    <h1>A new page.</h1>
    {draft && <NewPageEditor draft={draft} deck={deck} busy={busy} persist={persist} redraw={redraw} save={save} cancel={cancel} />}
  </>;

  const items = defaultView(page.components, deck.modules);
  const loading = page.components.some(item => item.status === 'loading');
  const missing = items.some(isMissing);
  const configured = page.components.some(item => item.kind === 'module' && item.configured);
  const locked = busy || Boolean(draft?.pending && !draft.errorCode);
  const known = new Set(page.components.map(item => item.id));
  const lost = editing && draft ? Object.keys(draft.texts).filter(id => !known.has(id)) : [];
  const hasContext = page.components.some(item => item.kind === 'context');

  return <>
    {notice}{back}
    <h1>{blockText(page.components.find(item => item.kind === 'main_key')!.content)}</h1>
    <Status status={page.status} prefix="Page: " />
    <section className="page-components">
      {items.map(item => {
        const title = label(item, deck);
        if (isMissing(item)) return <article className="component missing" key={`missing-${item.moduleInstanceId}`}>
          <h2>{title}</h2>
          <p className="muted">Not generated yet.</p>
        </article>;
        const text = blockText(item.content);
        const editable = editing && draft && Object.hasOwn(draft.texts, item.id);
        return <article className="component" key={item.id} data-component-id={item.id} data-kind={item.kind}>
          <h2>{title}{item.kind === 'module' && !item.configured && <span className="muted"> · no longer in this deck</span>}</h2>
          <Status status={item.status} prefix="" />
          {editable ? <>
            <TextField id={`component-${item.id}`} labelText={`Edit ${title}`} value={draft!.texts[item.id]}
              readOnly={locked || item.status === 'loading'} multiline={item.kind !== 'main_key'}
              onChange={value => { draft!.texts[item.id] = value; persist(); }} />
            {item.status === 'loading' && <p className="notice">This component is generating. Your draft is preserved; save explicitly after generation finishes.</p>}
          </> : text ? <pre>{text}</pre> :
            <p className="muted">{item.status === 'loading' ? 'Generating…' : item.status === 'failed' ? 'Generation failed.' : 'Empty.'}</p>}
          {!editing && item.kind === 'module' && item.configured && <button disabled={generating || item.status === 'loading'}
            onClick={() => void run({ scope: 'component', componentId: item.id })}>Retry</button>}
        </article>;
      })}
      {editing && draft && <>
        {!hasContext && <TextField id="context" labelText="Context (optional)" value={draft.context ?? ''} readOnly={locked}
          onChange={value => { draft.context = value; persist(); }} />}
        {draft.added.map((text, index) => <TextField key={index} id={`added-${index}`} labelText="Your text" value={text} readOnly={locked}
          onChange={value => { draft.added[index] = value; persist(); }} />)}
        <button disabled={locked} onClick={() => { draft.added.push(''); persist(); redraw(); }}>Add your own text</button>
        {lost.map(id => <div key={id}>
          <p className="notice">A component in this draft no longer exists. Its unsaved text is preserved below.</p>
          <pre>{draft.texts[id]}</pre>
        </div>)}
      </>}
    </section>
    {editing && draft ? <>
      <div className="dialog-actions">
        <button disabled={busy} onClick={() => void deletePage()}>Delete page</button>
        <button disabled={busy} onClick={() => void cancel()}>Cancel</button>
        <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? 'Try saving again' : 'Save'}</button>
      </div>
      {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
    </> : <div className="dialog-actions">
      <button onClick={begin}>Edit page</button>
      {missing && <button disabled={generating} onClick={() => void run({ scope: 'missing' })}>{configured ? 'Generate missing' : 'Generate'}</button>}
      {configured && <button disabled={generating || loading} onClick={() => void run({ scope: 'page' })}>Retry page</button>}
    </div>}
    {!editing && pendingSaves.map(item => <div className="notice" key={item.operationId}>
      <p>A change is waiting to be saved to your account.</p>
      <button onClick={() => void retryPendingSave(item.operationId)}>Try saving again</button>
    </div>)}
  </>;
}
