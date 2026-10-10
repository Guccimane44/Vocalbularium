import { useReducer } from 'react';
import type { DeckEditorDraft } from '../types/editor-drafts.js';
import type { DeckConfiguration } from '@vocabularium/contracts';
import { MAX_CONTENT_MODULES } from '@vocabularium/contracts';
import { MODULES } from '@vocabularium/domain/modules';
import type { ModuleType } from '@vocabularium/domain/modules';

const instance = (type: ModuleType) => ({ id: crypto.randomUUID(), type });

export const newDeckDraft = (): DeckConfiguration => ({
  name: '',
  modules: [instance('german-examples')],
  view: { module: 'default' }
});

function sample(type: string, inputType: 'word_phrase' | 'sentence', instance: number): string {
  const selected = inputType === 'word_phrase' ? '幸福' : '我真的很幸福';
  if (type === 'selected') return selected;
  if (type === 'selected-language') return selected + '\nChinese';
  const definition = MODULES[type as ModuleType];
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
  const full = modules.length >= MAX_CONTENT_MODULES;
  const sampleType = draft.sampleType ?? 'word_phrase';

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
    <div className="configuration">
      <section className="config-controls">
        <fieldset disabled={busy}>
          <label htmlFor="deck-name">Deck name</label>
          <input id="deck-name" value={draft.deck.name} onChange={event => {
            draft.deck.name = event.target.value;
            refresh();
          }} />
          <section className="module-list" aria-label="Content modules">
            <h2>Content modules</h2>
            <p className="muted">Each module generates its own component on every new page, in this order. Changes apply to future generation; existing pages keep their content.</p>
            {!modules.length && <p className="muted">No modules. New pages hold only their main key and your own text.</p>}
            {modules.map((module, index) => {
              const definition = MODULES[module.type as ModuleType];
              return <div className="module-block" key={module.id}>
                <span>{definition?.label ?? module.type}</span>
                <button aria-label={'Move module ' + (index + 1) + ' up'} disabled={index === 0}
                  onClick={() => { [modules[index - 1], modules[index]] = [modules[index], modules[index - 1]]; refresh(); }}>↑</button>
                <button aria-label={'Move module ' + (index + 1) + ' down'} disabled={index === modules.length - 1}
                  onClick={() => { [modules[index], modules[index + 1]] = [modules[index + 1], modules[index]]; refresh(); }}>↓</button>
                <button aria-label={'Remove module ' + (index + 1)}
                  onClick={() => { modules.splice(index, 1); refresh(); }}>Remove</button>
              </div>;
            })}
          </section>
          <h2 className="section-title">Module library</h2>
          {full && <p className="muted">A deck can have at most {MAX_CONTENT_MODULES} modules.</p>}
          <div className="module-library">
            {(Object.entries(MODULES) as Array<[ModuleType, (typeof MODULES)[ModuleType]]>)
              .map(([type, definition]) => <button key={type} disabled={full} onClick={() => {
                modules.push(instance(type));
                refresh();
              }}>Add {definition.label}</button>)}
          </div>
        </fieldset>
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
      </section>
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
        <article className="preview">
          <h3>Main key</h3>
          <pre>{sampleType === 'word_phrase' ? '幸福' : '我真的很幸福'}</pre>
        </article>
        {modules.map((module, index) => {
          const text = sample(module.type, sampleType, modules.slice(0, index).filter(other => other.type === module.type).length);
          return <article className="preview" key={module.id}>
            <h3>{(MODULES[module.type as ModuleType]?.label ?? module.type) + ' · Example'}</h3>
            {text ? <pre>{text}</pre> : <p className="muted">Does not apply to this input</p>}
          </article>;
        })}
      </section>
    </div>
  </>;
}
