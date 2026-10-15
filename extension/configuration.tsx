import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DeckEditorDraft } from '../types/editor-drafts.js';
import type { DeckColour, DeckConfiguration } from '@vocabularium/contracts';
import { applicableFacets, facetLabel, isParentType, withFacet } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import { addBlocked, CATALOG, DECK_COLOURS, isModuleType } from '@vocabularium/domain/page-modules';
import type { ModuleFamily } from '@vocabularium/domain/page-modules';
import { deckColour } from './deck-colour.ts';
import { FacetTags } from './facet-tags.tsx';
import { FamilyIcon } from './families.tsx';
import { mainKeyTier } from './main-key.ts';
import { ActionIcon, Content, LandingCard } from './page-view.tsx';
import { moduleLabel, ShapingArea } from './shaping.tsx';
import type { RowParts } from './shaping.tsx';

// A parent added to the deck starts with its core only (D08).
const instance = (type: string, facets?: string[]) => ({ id: crypto.randomUUID(), type, ...(facets || isParentType(type) ? { facets: facets ?? [] } : {}) });

// A new deck starts like a new account's My Deck, in a colour the user can change.
export const newDeckDraft = (): DeckConfiguration => ({
  name: '',
  colour: DECK_COLOURS[Math.floor(Math.random() * DECK_COLOURS.length)]!,
  modules: [instance('main-key'), instance('context'), instance('german', ['article', 'examples', 'synonyms', 'antonyms'])],
  view: { module: 'default' }
});

const SAMPLE = { word_phrase: '幸福', sentence: '我真的很幸福' } as const;
// What each parent would write for the samples (D08): its core, then the
// sections of the facets it has that apply to the sample.
const SAMPLE_TEXT: Record<ParentType, Record<'word_phrase' | 'sentence', { core: string; facets: Partial<Record<FacetType, string>> }>> = {
  german: {
    word_phrase: { core: '== Chinesisch (幸福, xìngfú) ==\n=== Bedeutungen ===\n: [1] Glück; Glückseligkeit; Wohlbefinden',
      facets: { article: ': das Glück', examples: ': [1] 她希望孩子们拥有幸福。\n:: Sie hofft, dass die Kinder Glück haben.', synonyms: ': Freude\n: Seligkeit', antonyms: ': Unglück' } },
    sentence: { core: 'Ich bin wirklich glücklich.',
      facets: { examples: ': [1] 想到我的家人和朋友，我觉得很幸福。\n:: Wenn ich an meine Familie und Freunde denke, bin ich glücklich.' } }
  },
  chinese: {
    word_phrase: { core: '== 汉语 (幸福, xìngfú) ==\n=== 释义 ===\n: [1] 生活、境遇称心如意',
      facets: { examples: ': [1] 她希望孩子们拥有幸福。', pinyin: ': 幸福 xìngfú' } },
    sentence: { core: '说话人表示自己非常满足、快乐。', facets: { examples: ': [1] 我现在真的很快乐。', pinyin: ': wǒ zhēn de hěn xìngfú' } }
  }
};
function sample(module: { type: string; facets?: readonly string[] }, inputType: 'word_phrase' | 'sentence'): string {
  if (module.type === 'main-key') return SAMPLE[inputType];
  if (module.type === 'context') return inputType === 'word_phrase' ? 'Wir wünschen euch viel 幸福 und Gesundheit.' : '她笑着说：“我真的很幸福。”';
  if (!isParentType(module.type)) return '';
  const text = SAMPLE_TEXT[module.type][inputType];
  return [text.core, ...applicableFacets(module.type, module.facets ?? [], inputType)
    .flatMap(facet => text.facets[facet] ? [`=== ${facetLabel(module.type as ParentType, facet)} ===\n${text.facets[facet]}`] : [])].join('\n');
}

// Deck colours (D06) are the family colours, named by hue: a deck's colour
// identifies the deck and says nothing about its modules.
const COLOUR_NAMES: Readonly<Record<DeckColour, string>> = {
  meaning: 'Blue', usage: 'Green', roots: 'Amber', connections: 'Violet', sound: 'Rose', notes: 'Sage'
};

// The six-dot menu on each module in the list; its entries are placeholders (0.6.3).
const DECK_MODULE_MENU = ['Duplicate', 'Copy to another deck…'] as const;

const familyOf = (type: string): ModuleFamily => (isModuleType(type) && CATALOG[type].family) || 'notes';

// A sample new page built from the configured modules, in a dialog opened from
// the Preview button above the list (0.6.3): the deck settings keep the
// same list-and-window layout as a page.
function PreviewDialog({ modules, sampleType, choose, close }: {
  modules: DeckConfiguration['modules']; sampleType: 'word_phrase' | 'sentence';
  choose: (value: 'word_phrase' | 'sentence') => void; close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  // Closing the dialog first returns focus to the Preview button that opened it.
  const done = () => { ref.current?.close(); close(); };
  const [key, ...rest] = modules;
  const mainKey = SAMPLE[sampleType];
  return <dialog ref={ref} className="preview-dialog" aria-labelledby="preview-title"
    onCancel={event => { event.preventDefault(); done(); }}
    onClick={event => { if (event.target === event.currentTarget) done(); }}>
    <div className="preview-head">
      <h2 id="preview-title">Preview</h2>
      <label className="visually-hidden" htmlFor="sample-input">Sample input</label>
      <select id="sample-input" value={sampleType} onChange={event => choose(event.target.value as 'word_phrase' | 'sentence')}>
        <option value="word_phrase">Word: 幸福</option>
        <option value="sentence">Sentence: 我真的很幸福</option>
      </select>
      <button type="button" className="preview-close" aria-label="Close preview" onClick={done}>×</button>
    </div>
    <p className="muted preview-note">A sample new page in this deck. Previews never create or change pages.</p>
    <div className="sample-page">
      <p className="main-key preview" data-type={key.type} data-tier={mainKeyTier(mainKey)}>{sample(key, sampleType)}</p>
      {rest.map(module => {
        const text = sample(module, sampleType);
        const family = familyOf(module.type);
        // Like a page, an empty component (Text) is only its tab.
        return <article className={`component preview fam-${family}`} data-empty={!text || undefined} key={module.id} data-type={module.type}>
          <div className="card-tab"><FamilyIcon family={family} /><h3>{moduleLabel(module.type)}</h3></div>
          {text && <Content type={module.type} text={text} mainKey={mainKey} />}
        </article>;
      })}
    </div>
  </dialog>;
}

// In deck settings a module has no component yet, so it is drawn as an empty
// component is on a page (0.7.1): only its tab, which drags it and, clicked,
// ejects Remove beside it, and a parent's facets hung below the tab on chains.
function DeckModule({ item, parts, busy, opened, setOpened, onRemove, onRemoveFacet }: {
  item: { id: string; label: string; type: string; facets?: string[] }; parts: RowParts; busy: boolean;
  opened: boolean; setOpened: (value: boolean) => void; onRemove: () => void; onRemoveFacet: (facet: string) => void;
}) {
  const family = familyOf(item.type);
  const tagged = isParentType(item.type) && Boolean(item.facets?.length);
  return <article className={`component deck-module fam-${family}`} data-empty data-module-id={item.id} data-type={item.type} data-tagged={tagged ? 'hanging' : undefined}>
    <div className="card-head" onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Escape' || !opened) return;
      setOpened(false);
      event.currentTarget.querySelector<HTMLElement>('.tab-button')?.focus();
    }}>
      <div className="card-tab">
        {parts.menu}
        <h2><button type="button" className="tab-button" {...parts.drag} aria-disabled={undefined}
          aria-expanded={opened} aria-controls={opened ? `actions-${item.id}` : undefined} onClick={() => setOpened(!opened)}>
          <FamilyIcon family={family} />
          <span className="tab-label">{item.label}</span>
        </button></h2>
      </div>
      {opened && <div id={`actions-${item.id}`} className="card-actions" role="group" aria-label={`${item.label} actions`} data-open>
        <button style={{ '--i': 0 } as CSSProperties} className="action-delete" aria-label={`Remove ${item.label}`} disabled={busy}
          onClick={() => { setOpened(false); onRemove(); }}><ActionIcon name="delete" />Remove</button>
      </div>}
    </div>
    {isParentType(item.type) && <FacetTags holderId={item.id} parent={item.type} facets={item.facets ?? []} layout="hanging" title={item.label}
      disabled={busy} onRemove={onRemoveFacet} />}
  </article>;
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
  // The module whose tab has ejected its Remove; one at a time.
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    if (!opened) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.(`[data-module-id="${CSS.escape(opened)}"] .card-head`)) setOpened(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [opened]);
  const refresh = () => redraw();
  const modules = draft.deck.modules;
  const busy = Boolean(draft.saving || draft.pending);
  const sampleType = draft.sampleType ?? 'word_phrase';
  // The main key stays first and cannot move or be removed; everything after it can.
  const [key, ...rest] = modules;
  const items = rest.map(module => ({ id: module.id, label: moduleLabel(module.type), type: module.type, facets: module.facets,
    holder: { id: module.id, type: module.type, facets: module.facets } }));
  // Facets join or leave a parent in the draft, in the parent's order (D08).
  const addFacet = (id: string, parent: ParentType, facet: FacetType) => {
    const module = modules.find(item => item.id === id);
    if (!module || module.type !== parent || module.facets?.includes(facet)) return false;
    module.facets = withFacet(parent, module.facets ?? [], facet); refresh(); return true;
  };
  const removeFacet = (id: string, facet: string) => {
    const module = modules.find(item => item.id === id);
    if (module) { module.facets = (module.facets ?? []).filter(item => item !== facet); refresh(); }
  };
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
        {DECK_COLOURS.map(colour => {
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
      label="Modules for new pages" where="the list" onAdd={add} onMove={(id, index) => { move(id, index); return true; }} onAddFacet={addFacet}
      pinned={<>
        <div className="list-intro">
          <div className="list-intro-head">
            <h2>Modules for new pages</h2>
            <button type="button" className="preview-open" aria-haspopup="dialog" onClick={() => { draft.previewing = true; refresh(); }}>Preview</button>
          </div>
          <p className="muted">New pages start with these modules, in this order. Existing pages keep their own.</p>
        </div>
        {/* The main key never moves and cannot be removed: a tab with its name only. */}
        <div className="component deck-module" data-empty data-type={key.type}>
          <div className="card-head"><div className="card-tab"><h2><span className="tab-label">{moduleLabel(key.type)}</span></h2></div></div>
        </div>
      </>}
      menuItems={DECK_MODULE_MENU}
      renderLanding={type => <LandingCard type={type} />}
      renderItem={(item, parts) => <DeckModule item={item} parts={parts} busy={busy}
        opened={opened === item.id} setOpened={value => setOpened(value ? item.id : null)}
        onRemove={() => { modules.splice(modules.findIndex(module => module.id === item.id), 1); refresh(); }}
        onRemoveFacet={facet => removeFacet(item.id, facet)} />} />
    {draft.previewing && <PreviewDialog modules={modules} sampleType={sampleType}
      choose={value => { draft.sampleType = value; refresh(); }}
      close={() => { draft.previewing = false; refresh(); }} />}
  </div>;
}
