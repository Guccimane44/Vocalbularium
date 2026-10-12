import { useReducer } from 'react';
import type { DeckEditorDraft } from '../types/editor-drafts.js';
import type { DeckConfiguration } from '@vocabularium/contracts';
import { MODULES } from '@vocabularium/domain/modules';
import type { ModuleType as ContentModuleType } from '@vocabularium/domain/modules';
import { addBlocked, CATALOG, FAMILIES, isModuleType } from '@vocabularium/domain/page-modules';
import type { ModuleFamily } from '@vocabularium/domain/page-modules';
import { deckColour } from './deck-colour.ts';
import { FamilyIcon } from './families.tsx';
import { mainKeyTier } from './main-key.ts';
import { Content } from './page-view.tsx';
import { moduleLabel, PinMark, ShapingArea } from './shaping.tsx';
import type { Projection } from './shaping.tsx';

const instance = (type: string) => ({ id: crypto.randomUUID(), type });

// A new deck starts like a new account's My Deck, in a colour the user can change.
export const newDeckDraft = (): DeckConfiguration => ({
  name: '',
  colour: FAMILIES[Math.floor(Math.random() * FAMILIES.length)]!,
  modules: [instance('main-key'), instance('context'), instance('german-examples')],
  view: { module: 'default' }
});

const SAMPLE = { word_phrase: '幸福', sentence: '我真的很幸福' } as const;
function sample(type: string, inputType: 'word_phrase' | 'sentence', instance: number): string {
  if (type === 'main-key') return SAMPLE[inputType];
  if (type === 'context') return inputType === 'word_phrase' ? 'Wir wünschen euch viel 幸福 und Gesundheit.' : '她笑着说：“我真的很幸福。”';
  if (type === 'text') return '';
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

// Deck colours (D06) are the family colours, named by hue: a deck's colour
// identifies the deck and says nothing about its modules.
const COLOUR_NAMES: Readonly<Record<ModuleFamily, string>> = {
  meaning: 'Blue', usage: 'Green', roots: 'Amber', connections: 'Violet', sound: 'Rose', notes: 'Sage'
};

const familyOf = (type: string): ModuleFamily => (isModuleType(type) && CATALOG[type].family) || 'notes';

// A sample page built from the configured modules in the order they would have
// if the current drag ended now, so it follows the list as the user drags.
function SamplePreview({ modules, projection, sampleType, choose }: {
  modules: DeckConfiguration['modules']; projection: Projection; sampleType: 'word_phrase' | 'sentence'; choose: (value: 'word_phrase' | 'sentence') => void;
}) {
  const [key, ...rest] = modules;
  const byId = new Map(rest.map(module => [module.id, module]));
  const ordered: { id: string; type: string; adding?: boolean }[] = projection.ids.map(id => byId.get(id)).filter(module => module !== undefined);
  if (projection.adding) ordered.splice(Math.min(projection.adding.index, ordered.length), 0, { id: 'adding', type: projection.adding.type, adding: true });
  const mainKey = SAMPLE[sampleType];
  const seen = new Map<string, number>();
  return <section className="shaping-preview" aria-labelledby="preview-title">
    <div className="preview-head">
      <h2 id="preview-title">Preview</h2>
      <label className="visually-hidden" htmlFor="sample-input">Sample input</label>
      <select id="sample-input" value={sampleType} onChange={event => choose(event.target.value as 'word_phrase' | 'sentence')}>
        <option value="word_phrase">Word: 幸福</option>
        <option value="sentence">Sentence: 我真的很幸福</option>
      </select>
    </div>
    <p className="muted preview-note">A sample new page in this deck. Previews never create or change pages.</p>
    <div className="sample-page" aria-live="polite">
      <p className="main-key preview" data-type={key.type} data-tier={mainKeyTier(mainKey)}>{sample(key.type, sampleType, 0)}</p>
      {ordered.map(module => {
        const count = seen.get(module.type) ?? 0;
        seen.set(module.type, count + 1);
        const text = sample(module.type, sampleType, count);
        const family = familyOf(module.type);
        // Like a page, an empty component (Text, or a module that does not apply to this input) is only its tab.
        return <article className={`component preview fam-${family}`} data-empty={!text || undefined} key={module.id} data-type={module.type} data-adding={module.adding || undefined}>
          <div className="card-tab"><FamilyIcon family={family} /><h3>{moduleLabel(module.type)}</h3></div>
          {text && <Content type={module.type} text={text} mainKey={mainKey} />}
        </article>;
      })}
    </div>
  </section>;
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
  // The main key stays first and cannot move or be removed; everything after it can.
  const [key, ...rest] = modules;
  const items = rest.map(module => ({ id: module.id, label: moduleLabel(module.type), type: module.type }));
  const add = (type: string, index: number) => {
    if (addBlocked(modules, type)) return false;
    modules.splice(index + 1, 0, instance(type)); refresh(); return true;
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

  const actions = <div className="head-actions">
    <button onClick={async () => {
      if (draft.pending) await chrome.storage.local.remove('save-' + draft.pending.operationId);
      onCancel();
    }}>Cancel</button>
    <button className="primary" disabled={Boolean(draft.saving)} onClick={() => void saveDraft()}>
      {draft.pending ? 'Try saving again' : 'Save'}
    </button>
  </div>;
  return <div className="deck-settings">
    <div className="page-head">
      <div>
        <p className="eyebrow">Deck settings</p>
        <h1>{draft.deck.id ? 'Shape your deck.' : 'A new collection.'}</h1>
      </div>
      {actions}
    </div>
    {draft.error && <p className="notice error">{draft.error}</p>}
    {externalError && <p className="notice error" role="alert">{externalError}</p>}
    <fieldset className="deck-name" disabled={busy}>
      <label htmlFor="deck-name">Deck name</label>
      <input id="deck-name" value={draft.deck.name} onChange={event => {
        draft.deck.name = event.target.value;
        refresh();
      }} />
    </fieldset>
    <fieldset className="deck-colour" disabled={busy}>
      <legend>Deck colour</legend>
      <div className="colour-swatches">
        {FAMILIES.map(colour => {
          const checked = deckColour(draft.deck) === colour;
          return <label key={colour} className={`colour-swatch fam-${colour}`} title={COLOUR_NAMES[colour]}>
            <input type="radio" name="deck-colour" value={colour} checked={checked}
              onChange={() => { draft.deck.colour = colour; refresh(); }} />
            <span className="visually-hidden">{COLOUR_NAMES[colour]}</span>
          </label>;
        })}
      </div>
    </fieldset>
    <ShapingArea items={items} types={modules.map(module => module.type)} disabled={busy} unavailable={busy ? 'Saving…' : undefined}
      label="Modules for new pages" where="the list" onAdd={add} onMove={(id, index) => { move(id, index); return true; }}
      pinned={<>
        <div className="list-intro">
          <h2>Modules for new pages</h2>
          <p className="muted">New pages start with these modules, in this order. Existing pages keep their own.</p>
        </div>
        <div className="module-block" data-type={key.type}>
          <PinMark />
          <span>{moduleLabel(key.type)}</span>
        </div>
      </>}
      renderItem={(item, handle) => <div className={`module-block fam-${familyOf(item.type)}`} data-type={item.type}>
        {handle}
        <FamilyIcon family={familyOf(item.type)} />
        <span>{item.label}</span>
        <button aria-label={`Remove ${item.label}`} disabled={busy}
          onClick={() => { modules.splice(modules.findIndex(module => module.id === item.id), 1); refresh(); }}>Remove</button>
      </div>}
      preview={projection => <SamplePreview modules={modules} projection={projection} sampleType={sampleType}
        choose={value => { draft.sampleType = value; refresh(); }} />} />
  </div>;
}
