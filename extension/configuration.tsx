import { useReducer } from 'react';
import type { DeckEditorDraft } from '../types/editor-drafts.js';
import type { DeckLayout } from '@vocabularium/contracts';
import { MODULES } from '@vocabularium/domain/modules';
import type { ModuleType } from '@vocabularium/domain/modules';
import { dialog } from './dialog.js';

const page = (type?: ModuleType) => ({
  id: crypto.randomUUID(),
  modules: type ? [{ id: crypto.randomUUID(), type }] : []
});

export const newDeckDraft = (): DeckLayout => ({
  name: '',
  pages: [page('selected'), page('german-examples')]
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
  if (!draft.deck.pages.some(item => item.id === draft.selectedPage)) {
    draft.selectedPage = draft.deck.pages[0].id;
  }
  const current = draft.deck.pages.find(item => item.id === draft.selectedPage)!;
  const currentIndex = draft.deck.pages.indexOf(current);
  const busy = Boolean(draft.saving || draft.pending);
  const sampleType = draft.sampleType ?? 'word_phrase';

  async function saveDraft(): Promise<void> {
    const pending = draft.pending ?? {
      operationId: crypto.randomUUID(),
      payload: { deck: structuredClone(draft.deck), basePageIds: [...draft.basePageIds] }
    };
    draft.pending = pending;
    draft.saving = true;
    draft.error = undefined;
    refresh();
    try {
      const next = await send({ type: 'save-deck', ...pending });
      draft.pending = undefined;
      await onSaved(next);
    } catch (error) {
      const failure = error as Error & { code?: string; details?: { confirmation?: string } };
      if (failure.code === 'content_loss') {
        const decision = await dialog({
          title: 'Delete page content?',
          message: failure.message + ' This includes content saved from other installations.',
          choices: ['Cancel', 'Confirm'],
          select: undefined
        });
        draft.pending = undefined;
        if (decision.choice === 'Confirm' && failure.details?.confirmation) {
          draft.pending = { ...pending, payload: { ...pending.payload, confirmation: failure.details.confirmation } };
          draft.saving = false;
          await saveDraft();
          return;
        }
      } else {
        draft.pending = ['invalid', 'front_page', 'deleted', 'replacement'].includes(failure.code ?? '')
          ? undefined : pending;
        draft.error = failure.message;
      }
    } finally {
      draft.saving = false;
      refresh();
    }
  }

  return <>
    <p className="eyebrow">DECK CONFIGURATION</p>
    <h1>{draft.deck.id ? 'Shape your deck.' : 'A new collection.'}</h1>
    <div className="configuration">
      <section className="config-controls">
        <fieldset disabled={busy}>
          <label htmlFor="deck-name">Deck name</label>
          <input id="deck-name" value={draft.deck.name} onChange={event => {
            draft.deck.name = event.target.value;
            refresh();
          }} />
          <label htmlFor="page-count">Number of pages</label>
          <select id="page-count" value={String(draft.deck.pages.length)} onChange={event => {
            const target = Number(event.target.value);
            while (draft.deck.pages.length < target) draft.deck.pages.push(page());
            draft.deck.pages.splice(target);
            refresh();
          }}>
            {[1, 2, 3, 4].map(count => <option value={count} key={count}>{count}</option>)}
          </select>
          <nav className="pages" aria-label="Configure pages">
            {draft.deck.pages.map((item, index) => <button key={item.id}
              aria-current={item.id === draft.selectedPage}
              onClick={() => { draft.selectedPage = item.id; refresh(); }}>Page {index + 1}</button>)}
          </nav>
          <section className="module-page">
            <h2>{currentIndex === 0 ? 'Front page' : 'Page ' + (currentIndex + 1)}</h2>
            {!current.modules.length && <p className="muted">No modules. This page will be empty.</p>}
            {current.modules.map((module, index) => {
              const definition = MODULES[module.type as ModuleType];
              return <div className="module-block" key={module.id}>
                <span>{definition?.label ?? module.type}</span>
                <button aria-label={'Move module ' + (index + 1) + ' up'} disabled={index === 0}
                  onClick={() => { [current.modules[index - 1], current.modules[index]] = [current.modules[index], current.modules[index - 1]]; refresh(); }}>↑</button>
                <button aria-label={'Move module ' + (index + 1) + ' down'} disabled={index === current.modules.length - 1}
                  onClick={() => { [current.modules[index], current.modules[index + 1]] = [current.modules[index + 1], current.modules[index]]; refresh(); }}>↓</button>
                <button aria-label={'Remove module ' + (index + 1)}
                  onClick={() => { current.modules.splice(index, 1); refresh(); }}>Remove</button>
              </div>;
            })}
            {currentIndex !== 0 && <button onClick={() => {
              draft.deck.pages = draft.deck.pages.filter(item => item !== current);
              refresh();
            }}>Remove this page</button>}
          </section>
          <h2 className="section-title">Module library</h2>
          <div className="module-library">
            {(Object.entries(MODULES) as Array<[ModuleType, (typeof MODULES)[ModuleType]]>)
              .map(([type, definition]) => <button key={type} onClick={() => {
                current.modules.push({ id: crypto.randomUUID(), type });
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
        <p className="muted">Illustrative samples only. Previews do not create or change cards.</p>
        <label htmlFor="sample-input">Sample input</label>
        <select id="sample-input" value={sampleType} onChange={event => {
          draft.sampleType = event.target.value as 'word_phrase' | 'sentence';
          refresh();
        }}>
          <option value="word_phrase">Word / phrase: 幸福</option>
          <option value="sentence">Sentence: 我真的很幸福</option>
        </select>
        {draft.deck.pages.map((item, index) => {
          const text = item.modules.map((module, instance) => sample(module.type, sampleType, instance))
            .filter(Boolean).join('\n\n');
          return <article className="preview" key={item.id}>
            <h3>{'Page ' + (index + 1) + ' · Example'}</h3>
            {text ? <pre>{text}</pre> : <p className="muted">Empty page</p>}
          </article>;
        })}
      </section>
    </div>
  </>;
}
