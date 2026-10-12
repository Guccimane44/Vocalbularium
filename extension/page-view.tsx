import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Component, GenerationTarget, ModuleInstance, Page } from '@vocabularium/contracts';
import { CATALOG, isContentType, isModuleType } from '@vocabularium/domain/page-modules';
import { blockText, mainKeyOf } from '@vocabularium/domain/pages';
import { emphasise, renderContent } from '@vocabularium/domain/render';
import type { PageEditorDraft } from '../types/editor-drafts.js';
import { FamilyIcon } from './families.tsx';
import { mainKeyTier } from './main-key.ts';
import { GeneratingStatus } from './page-list.tsx';
import { moduleLabel, PinMark, ShapingArea } from './shaping.tsx';
import type { RowParts } from './shaping.tsx';

// The six-dot menu on each card; its entries are placeholders (0.6.3).
const COMPONENT_MENU = ['Duplicate', 'Copy text', 'Move to page…'] as const;

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

// Generated content as its module's render contract describes; anything else,
// and the user's own text, as plain text with its line breaks.
export function Content({ type, text, mainKey }: { type: string; text: string; mainKey: string }) {
  const rendered = renderContent(type, text);
  if (rendered.kind === 'plain') return <pre>{rendered.text}</pre>;
  if (rendered.kind === 'sentence') return <p className="reading">{rendered.text}</p>;
  const { heading, meanings, examples } = rendered;
  const marked = (text: string) => emphasise(text, mainKey).map((part, index) => part.key ? <mark key={index}>{part.text}</mark> : part.text);
  return <div className="entry-content">
    {heading && <p className="entry-heading">
      <span className="entry-language">{heading.language}</span>
      {heading.key && <span className="entry-key">{heading.key}</span>}
      {heading.pronunciation && <span className="entry-pronunciation">{heading.pronunciation}</span>}
    </p>}
    <ol className="meanings">{meanings.map(meaning => <li key={meaning.number} data-number={meaning.number}>{meaning.text}</li>)}</ol>
    {examples.length > 0 && <>
      <h3 className="examples-title">Examples</h3>
      <ul className="examples">{examples.map((example, index) => <li key={index}>
        <span className="example-number">{example.number}</span>
        <span className="example-sentence">{marked(example.sentence)}</span>
        {example.translation && <span className="example-translation">{example.translation}</span>}
      </li>)}</ul>
    </>}
  </div>;
}

function ComponentBody({ item, title, editable, draft, locked, persist, mainKey }: {
  item: Component; title: string; editable: boolean; draft?: PageEditorDraft; locked: boolean; persist: () => void; mainKey: string;
}) {
  const text = blockText(item.content);
  if (editable && draft) return <>
    <TextField id={`component-${item.id}`} labelText={`Edit ${title}`} value={draft.texts[item.id]}
      readOnly={locked || item.status === 'loading'} multiline={item.moduleType !== 'main-key' || mainKeyTier(draft.texts[item.id]) === 'passage'}
      onChange={value => { draft.texts[item.id] = value; persist(); }} />
    {item.status === 'loading' && <p className="notice">This component is generating. Your draft is preserved; save explicitly after generation finishes.</p>}
  </>;
  return text ? <Content type={item.moduleType} text={text} mainKey={mainKey} /> : null;
}

// Motion (D05): when a component finishes generating while the page is open,
// its content rises into the card line by line, and screen readers hear how
// the attempt ended.
function Reveal({ status, title, children }: { status: string | null; title: string; children: ReactNode }) {
  const previous = useRef(status);
  const [revealing, setRevealing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    const ended = previous.current === 'loading' && status !== 'loading';
    previous.current = status;
    if (status === 'loading') setAnnouncement('');
    if (!ended) return;
    setAnnouncement(status === 'failed' ? `${title}: generation failed.` : `${title} generated.`);
    if (status !== 'completed') return;
    setRevealing(true);
    const timer = setTimeout(() => setRevealing(false), 1200);
    return () => clearTimeout(timer);
  }, [status, title]);
  return <div className="card-body" data-reveal={revealing || undefined}>
    {children}
    <span className="visually-hidden" role="status">{announcement}</span>
  </div>;
}

// The page title: the main key in its tier; a passage is cut after six lines.
export function MainKeyTitle({ text }: { text: string }) {
  const tier = mainKeyTier(text);
  const title = useRef<HTMLHeadingElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const node = title.current;
    if (!node || tier !== 'passage') { setOverflows(false); return; }
    const measure = () => setOverflows(expanded || node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, tier, expanded]);
  return <>
    <h1 ref={title} className="main-key" data-tier={tier} data-expanded={expanded || undefined}>{text}</h1>
    {overflows && <button className="show-all" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show all'}</button>}
  </>;
}

export function PageView({ page, deck, draft, isNew, editing, busy, error, pendingSaves, retryPendingSave,
  navigate, begin, persist, save, cancel, discardUnavailable, deletePage, generate, addModule, moveComponent, deleteComponent }: Props) {
  const [working, setWorking] = useState(false);
  // The card whose tab has ejected its actions; one at a time.
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    if (!opened) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.(`[data-component-id="${CSS.escape(opened)}"] .card-head`)) setOpened(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [opened]);
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

  const mainKey = mainKeyOf(page.components);
  // A card's actions are ejected from its tab when the tab is clicked (D07);
  // a failed card keeps its Retry beside the tab. Choosing one closes them.
  const actions = (item: Component, title: string) => {
    const generated = isContentType(item.moduleType);
    const firstRun = generated && item.attemptId === null && !blockText(item.content);
    const open = opened === item.id;
    if (!open && !(item.status === 'failed' && generated)) return null;
    const choose = (action: () => void) => () => { setOpened(null); action(); };
    let index = 0;
    const order = () => ({ '--i': index++ }) as CSSProperties;
    return <div id={`actions-${item.id}`} className="card-actions" role="group" aria-label={`${title} actions`} data-open={open || undefined}>
      {open && <button style={order()} aria-label={`Edit ${title}`} disabled={Boolean(editingId) || item.status === 'loading'} onClick={choose(() => begin(item.id))}>Edit</button>}
      {generated && <button style={order()} aria-label={`${firstRun ? 'Generate' : 'Retry'} ${title}`} disabled={working || Boolean(editingId) || item.status === 'loading'}
        onClick={choose(() => void run(() => generate({ scope: 'component', componentId: item.id })))}>{firstRun ? 'Generate' : 'Retry'}</button>}
      {open && <button style={order()} aria-label={`Delete ${title}`} disabled={disabled || working || item.status === 'loading'}
        onClick={choose(() => void run(async () => { await deleteComponent(item); }))}>Delete</button>}
    </div>;
  };
  const editor = (item: Component, title: string) => editingId === item.id && draft && <>
    <ComponentBody item={item} title={title} editable draft={draft} locked={locked} persist={persist} mainKey={mainKey} />
    <div className="component-tools">
      <button disabled={busy} onClick={() => void cancel()}>Cancel</button>
      <button className="primary" disabled={busy} onClick={() => void save()}>{draft.pending ? 'Try saving again' : 'Save'}</button>
    </div>
    {draft.error && <p className="notice error" role="alert">{draft.error}</p>}
  </>;

  // One card: its index tab (menu, then the family and label, which drags the
  // card and, clicked, ejects its actions beside it), its status only while
  // unfinished, and its content. An empty component is only its tab. Editing
  // is one card at a time; Save and Cancel live in that card.
  const card = (item: Component, title: string, { drag, menu }: RowParts) => {
    const family = isModuleType(item.moduleType) ? CATALOG[item.moduleType].family ?? 'notes' : 'notes';
    const empty = !blockText(item.content) && item.status !== 'loading' && item.status !== 'failed' && editingId !== item.id;
    return <article className={`component fam-${family}`} data-empty={empty || undefined}
      data-component-id={item.id} data-type={item.moduleType} data-status={item.status ?? undefined} data-editing={editingId === item.id || undefined}>
      <div className="card-head" onKeyDown={event => {
        if (event.key !== 'Escape' || opened !== item.id) return;
        setOpened(null);
        (event.currentTarget.querySelector('.tab-button') as HTMLElement | null)?.focus();
      }}>
        <div className="card-tab">
          {menu}
          <h2><button type="button" className="tab-button" {...drag} aria-disabled={undefined}
            aria-expanded={opened === item.id} aria-controls={opened === item.id ? `actions-${item.id}` : undefined}
            onClick={() => setOpened(opened === item.id ? null : item.id)}>
            <FamilyIcon family={family} />
            <span className="tab-label">{title}</span>
          </button></h2>
        </div>
        {editingId !== item.id && actions(item, title)}
      </div>
      {item.status === 'loading' && editingId !== item.id && <p className="card-status"><GeneratingStatus /></p>}
      {item.status === 'failed' && <p className="card-status"><span className="list-status" data-status="failed">Generation failed</span></p>}
      {editor(item, title) || (!empty
        && <Reveal status={item.status} title={title}><ComponentBody item={item} title={title} editable={false} draft={draft} locked={locked} persist={persist} mainKey={mainKey} /></Reveal>)}
    </article>;
  };

  return <>
    {notice}{back}
    <div className="page-header" data-component-id={key.id} data-type="main-key" data-editing={editingId === key.id || undefined}>
      <div className="page-title">
        {editingId === key.id ? editor(key, 'Main key') : <MainKeyTitle text={mainKey} />}
      </div>
      <div className="title-actions">
        <PinMark />
        {editingId !== key.id && <button className="title-edit" aria-label="Edit Main key" disabled={Boolean(editingId)} onClick={() => begin(key.id)}>Edit</button>}
        <button disabled={busy || Boolean(editingId)} onClick={() => void deletePage()}>Delete page</button>
      </div>
    </div>
    <ShapingArea items={items} types={page.components.map(item => item.moduleType)} disabled={disabled}
      label="Components" where="the page"
      onAdd={(type, index) => addModule(type, index + 1)}
      onMove={(id, index) => moveComponent(id, index + 1)}
      menuItems={COMPONENT_MENU}
      renderItem={(item, parts) => card(item.component, item.label, parts)} />
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
