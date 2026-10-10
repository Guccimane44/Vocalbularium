import { useReducer } from 'react';
import type { DeckEditorDraft } from '../types/editor-drafts.js';
import type { DeckConfiguration } from '@vocabularium/contracts';
import { MODULES } from '@vocabularium/domain/modules';
import type { ModuleType as ContentModuleType } from '@vocabularium/domain/modules';
import { addBlocked } from '@vocabularium/domain/page-modules';
import { DropEnd, ModuleWindow, moduleLabel, ShapingArea, SortableRow } from './shaping.tsx';

const instance = (type: string) => ({ id: crypto.randomUUID(), type });

// A new deck starts like a new account's My Deck.
export const newDeckDraft = (): DeckConfiguration => ({
  name: '',
  modules: [instance('main-key'), instance('context'), instance('german-examples')],
  view: { module: 'default' }
});

const SAMPLE = { word_phrase: '幸福', sentence: '我真的很幸福' } as const;
function sample(type: string, inputType: 'word_phrase' | 'sentence', instance: number): string | null {
  if (type === 'main-key') return SAMPLE[inputType];
  if (type === 'context') return inputType === 'word_phrase' ? 'Wir wünschen euch viel 幸福 und Gesundheit.' : '她笑着说：“我真的很幸福。”';
  if (type === 'text') return null;
  const definition = MODULES[type as ContentModuleType];
  if (!definition || definition.applies !== inputType) return '';
  if (type === 'sentence-usage') return instance % 2
    ? '想到我的家人和朋友，我觉得我真的很幸福。'
    : '在这个温暖的家里，我真的很幸福。';
  const explanation = '== Chinesisch (幸福, xìngfú) ==\n=== Bedeutungen ===\n: [1] Glück; Glückseligkeit; Wohlbefinden';
  return explanation + (type === 'german-examples'
    ? '\n=== Beispiele ===\n: [1] 她希望孩子们拥有幸福。\n:: Sie hofft, dass die Kinder Glück haben.'
    : '');
}

type Props = {
  draft: DeckEditorDraft;
  send: (message: Record<string, unknown>) => Promise<unknown>;
  onSaved: (next: unknown) => Promise<void>;
  onCancel: () => void;
  externalError?: string;
};

export function ConfigurationView({ draft, send, onSaved, onCancel, externalError }: Props) {
  const [, redraw] = useReducer((value: number) => value + 1, 0);
  const refresh = () => redraw();
  const modules = draft.deck.modules;
  const busy = Boolean(draft.saving || draft.pending);
  const sampleType = draft.sampleType ?? 'word_phrase';
  // The main key is always first and stays; everything after it can move.
  const [key, ...rest] = modules;
  const items = rest.map(module => ({ id: module.id, label: moduleLabel(module.type) }));
  const add = (type: string, index = rest.length) => {
    if (addBlocked(modules, type)) return;
    modules.splice(index + 1, 0, instance(type)); refresh();
  };
  const move = (id: string, index: number) => {
    const from = modules.findIndex(module => module.id === id);
    const [module] = modules.splice(from, 1);
    modules.splice(index + 1, 0, module); refresh();
  };

  async function saveDraft(): Promise<void> {
    const pending = draft.pending ?? { operationId: crypto.randomUUID(), payload: { deck: structuredClone(draft.deck) } };
    draft.pending = pending;
    draft.saving = true;
    draft.error = undefined;
    refresh();
    try {
      const next = await send({ type: 'save-deck', ...pending });
      draft.pending = undefined;
      await onSaved(next);
    } catch (error) {
      const failure = error as Error & { code?: string };
      draft.pending = ['invalid', 'deleted'].includes(failure.code ?? '') ? undefined : pending;
      draft.error = failure.message;
    } finally {
      draft.saving = false;
      refresh();
    }
  }

  return <>
    <p className="eyebrow">DECK SETTINGS</p>
    <h1>{draft.deck.id ? 'Shape your deck.' : 'A new collection.'}</h1>
    <fieldset disabled={busy}>
      <label htmlFor="deck-name">Deck name</label>
      <input id="deck-name" value={draft.deck.name} onChange={event => {
        draft.deck.name = event.target.value;
        refresh();
      }} />
    </fieldset>
    <ShapingArea items={items} disabled={busy} onAdd={add} onMove={move}>
      <div className="shaping-layout">
        <section className="module-list" aria-label="Deck modules">
          <h2>Modules for new pages</h2>
          <p className="muted">Every new page in this deck starts with these modules, in this order. Changes apply to pages created afterwards; existing pages keep their own modules.</p>
          <div className="module-block pinned" data-type={key.type}>
            <span>Main key <span className="muted">· always first</span></span>
          </div>
          {rest.map((module, index) => {
            const label = moduleLabel(module.type);
            return <SortableRow key={module.id} id={module.id} label={label} disabled={busy} className="module-block">
              {handle => <>
                {handle}
                <span data-type={module.type}>{label}</span>
                <button aria-label={`Move ${label} up`} disabled={busy || index === 0}
                  onClick={() => move(module.id, index - 1)}>↑</button>
                <button aria-label={`Move ${label} down`} disabled={busy || index === rest.length - 1}
                  onClick={() => move(module.id, index + 1)}>↓</button>
                <button aria-label={`Remove ${label}`} disabled={busy}
                  onClick={() => { modules.splice(index + 1, 1); refresh(); }}>Remove</button>
              </>}
            </SortableRow>;
          })}
          {!rest.length && <p className="muted">Only the main key. New pages start with it and grow from the module window.</p>}
          <DropEnd disabled={busy} />
        </section>
        <ModuleWindow types={modules.map(module => module.type)} unavailable={busy ? 'Saving…' : undefined} where="the list" onAdd={type => add(type)} />
      </div>
    </ShapingArea>
    <div className="dialog-actions">
      <button onClick={async () => {
        if (draft.pending) await chrome.storage.local.remove('save-' + draft.pending.operationId);
        onCancel();
      }}>Cancel</button>
      <button className="primary" disabled={Boolean(draft.saving)} onClick={() => void saveDraft()}>
        {draft.pending ? 'Try saving again' : 'Save'}
      </button>
    </div>
    {draft.error && <p className="notice error">{draft.error}</p>}
    {externalError && <p className="notice error" role="alert">{externalError}</p>}
    <section className="showcase">
      <h2>Example previews</h2>
      <p className="muted">Illustrative samples only. Previews do not create or change pages.</p>
      <label htmlFor="sample-input">Sample input</label>
      <select id="sample-input" value={sampleType} onChange={event => {
        draft.sampleType = event.target.value as 'word_phrase' | 'sentence';
        refresh();
      }}>
        <option value="word_phrase">Word / phrase: 幸福</option>
        <option value="sentence">Sentence: 我真的很幸福</option>
      </select>
      {modules.map((module, index) => {
        const text = sample(module.type, sampleType, modules.slice(0, index).filter(other => other.type === module.type).length);
        return <article className="preview" key={module.id}>
          <h3>{moduleLabel(module.type) + ' · Example'}</h3>
          {text === null ? <p className="muted">Your own notes</p> : text ? <pre>{text}</pre> : <p className="muted">Does not apply to this input</p>}
        </article>;
      })}
    </section>
  </>;
}
