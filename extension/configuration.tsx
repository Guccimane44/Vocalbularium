import { useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DeckEditorDraft } from '../types/editor-drafts.js';
import type { DeckColour, DeckConfiguration } from '@vocabularium/contracts';
import { isParentType, withFacet } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import { MODULES } from '@vocabularium/domain/catalog';
import { addBlocked, CATALOG, DECK_COLOURS, isModuleType } from '@vocabularium/domain/page-modules';
import type { ModuleFamily } from '@vocabularium/domain/page-modules';
import { sampleOf } from '@vocabularium/domain/explanations';
import { deckColour } from './deck-colour.ts';
import { FacetTags } from './facet-tags.tsx';
import { FacetWindow } from './facet-window.tsx';
import { FamilyIcon } from './families.tsx';
import { mainKeyTier } from './main-key.ts';
import { ActionIcon, Content, LandingCard } from './page-view.tsx';
import { moduleLabel, numbered, ShapingArea } from './shaping.tsx';
import type { RowParts } from './shaping.tsx';
import { t } from './i18n.ts';
import type { MessageKey } from './i18n.ts';

// A parent added to the deck starts with its core only (D08).
const instance = (type: string, facets?: string[]) => ({ id: crypto.randomUUID(), type, ...(facets || isParentType(type) ? { facets: facets ?? [] } : {}) });

// A new deck starts like a new account's My Deck, in a colour the user can change.
export const newDeckDraft = (): DeckConfiguration => ({
  name: '',
  colour: DECK_COLOURS[Math.floor(Math.random() * DECK_COLOURS.length)]!,
  modules: [instance('main-key'), instance('context'), instance('german', ['article', 'examples', 'synonyms', 'antonyms'])],
  view: { module: 'default' }
});

// Deck colours (D06) are the family colours, named by hue: a deck's colour
// identifies the deck and says nothing about its modules.
const COLOUR_NAMES: Readonly<Record<DeckColour, MessageKey>> = {
  meaning: 'deck.colour.blue', usage: 'deck.colour.green', roots: 'deck.colour.amber', connections: 'deck.colour.violet', sound: 'deck.colour.rose', notes: 'deck.colour.sage'
};

// The six-dot menu on each module in the list; its entries are placeholders (0.6.3).
const deckModuleMenu = () => [t('card.menu.duplicate'), t('deck.menu.copyToDeck')];

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
  const mainKey = MODULES['main-key'].sample![sampleType] as string;
  return <dialog ref={ref} className="preview-dialog" aria-labelledby="preview-title"
    onCancel={event => { event.preventDefault(); done(); }}
    onClick={event => { if (event.target === event.currentTarget) done(); }}>
    <div className="preview-head">
      <h2 id="preview-title">{t('deck.preview')}</h2>
      <label className="visually-hidden" htmlFor="sample-input">{t('deck.preview.sampleInput')}</label>
      <select id="sample-input" value={sampleType} onChange={event => choose(event.target.value as 'word_phrase' | 'sentence')}>
        <option value="word_phrase">{t('deck.preview.word', { sample: '幸福' })}</option>
        <option value="sentence">{t('deck.preview.sentence', { sample: '我真的很幸福' })}</option>
      </select>
      <button type="button" className="preview-close" aria-label={t('deck.preview.close')} onClick={done}>×</button>
    </div>
    <p className="muted preview-note">{t('deck.preview.note')}</p>
    <div className="sample-page">
      <p className="main-key preview" dir="auto" data-type={key.type} data-tier={mainKeyTier(mainKey)}>{mainKey}</p>
      {rest.map(module => {
        // A module's sample from the catalog (D11), with the facets it has here.
        const rendered = sampleOf(module.type, sampleType, module.facets ?? []);
        const family = familyOf(module.type);
        // Like a page, an empty component (Text) is only its tab.
        return <article className={`component preview fam-${family}`} data-empty={!rendered || undefined} key={module.id} data-type={module.type}>
          <div className="card-tab"><FamilyIcon family={family} /><h3>{moduleLabel(module.type)}</h3></div>
          {rendered && <Content type={module.type} rendered={rendered} mainKey={mainKey} />}
        </article>;
      })}
    </div>
  </dialog>;
}

// In deck settings a module has no component yet, so it is drawn as an empty
// component is on a page (0.7.1): only its tab, which drags it and, clicked,
// ejects Remove beside it, and a parent's facets hung below the tab on chains.
// A parent also ejects Facet before Remove, opening its facet window on the
// draft (D13, 0.8.1); with no content to lose, unticking never asks.
function DeckModule({ item, parts, busy, opened, setOpened, choosing, setChoosing, onRemove, onAddFacet, onRemoveFacet }: {
  item: { id: string; label: string; type: string; facets?: string[] }; parts: RowParts; busy: boolean;
  opened: boolean; setOpened: (value: boolean) => void;
  // Whether this parent's facet window is open.
  choosing: boolean; setChoosing: (value: boolean) => void;
  onRemove: () => void; onAddFacet: (facet: FacetType) => boolean; onRemoveFacet: (facet: string) => void;
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
      {opened && <div id={`actions-${item.id}`} className="card-actions" role="group" aria-label={t('card.actions', { card: item.label })} data-open>
        {isParentType(item.type) && <button style={{ '--i': 0 } as CSSProperties} aria-label={t('card.facetsOf', { card: item.label })} disabled={busy}
          onClick={() => { setOpened(false); setChoosing(true); }}><ActionIcon name="facet" />{t('card.facet')}</button>}
        <button style={{ '--i': isParentType(item.type) ? 1 : 0 } as CSSProperties} className="action-delete" aria-label={t('action.removeNamed', { name: item.label })} disabled={busy}
          onClick={() => { setOpened(false); onRemove(); }}><ActionIcon name="delete" />{t('common.remove')}</button>
      </div>}
      {choosing && isParentType(item.type) && <FacetWindow holderId={item.id} parent={item.type} title={item.label} facets={item.facets ?? []}
        disabled={busy} hasContent={() => false} onAdd={onAddFacet} onRemove={onRemoveFacet}
        onClose={refocus => {
          setChoosing(false);
          if (refocus) document.querySelector<HTMLElement>(`[data-module-id="${CSS.escape(item.id)}"] .tab-button`)?.focus();
        }} />}
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
  // The parent whose facet window is open (D13, 0.8.1).
  const [choosing, setChoosing] = useState<string | null>(null);
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
  const items = numbered(rest.map(module => ({ id: module.id, label: moduleLabel(module.type), type: module.type, facets: module.facets })));
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
    }}>{t('common.cancel')}</button>
    <button className="primary" disabled={Boolean(draft.saving)} onClick={() => void saveDraft()}>
      {draft.pending ? t('common.trySavingAgain') : t('common.save')}
    </button>
  </div>;
  return <div className="deck-settings">
    <div className="page-head">
      <div>
        <p className="eyebrow">{t('deck.settings')}</p>
        <h1>{draft.deck.id ? t('deck.settings.title') : t('deck.settings.newTitle')}</h1>
      </div>
      {actions}
    </div>
    {draft.error && <p className="notice error">{draft.error}</p>}
    {externalError && <p className="notice error" role="alert">{externalError}</p>}
    <fieldset className="deck-name" disabled={busy}>
      <label htmlFor="deck-name">{t('deck.name')}</label>
      <input id="deck-name" dir="auto" value={draft.deck.name} onChange={event => {
        draft.deck.name = event.target.value;
        refresh();
      }} />
    </fieldset>
    <fieldset className="deck-colour" disabled={busy}>
      <legend>{t('deck.colour')}</legend>
      <div className="colour-swatches">
        {DECK_COLOURS.map(colour => {
          const checked = deckColour(draft.deck) === colour;
          return <label key={colour} className={`colour-swatch fam-${colour}`} title={t(COLOUR_NAMES[colour])}>
            <input type="radio" name="deck-colour" value={colour} checked={checked}
              onChange={() => { draft.deck.colour = colour; refresh(); }} />
            <span className="visually-hidden">{t(COLOUR_NAMES[colour])}</span>
          </label>;
        })}
      </div>
    </fieldset>
    <ShapingArea items={items} types={modules.map(module => module.type)} disabled={busy} unavailable={busy ? t('status.savingEllipsis') : undefined}
      label={t('deck.modules')} where="list" onAdd={add} onMove={(id, index) => { move(id, index); return true; }}
      pinned={<>
        <div className="list-intro">
          <div className="list-intro-head">
            <h2>{t('deck.modules')}</h2>
            <button type="button" className="preview-open" aria-haspopup="dialog" onClick={() => { draft.previewing = true; refresh(); }}>{t('deck.preview')}</button>
          </div>
          <p className="muted">{t('deck.modules.hint')}</p>
        </div>
        {/* The main key never moves and cannot be removed: a tab with its name only. */}
        <div className="component deck-module" data-empty data-type={key.type}>
          <div className="card-head"><div className="card-tab"><h2><span className="tab-label">{moduleLabel(key.type)}</span></h2></div></div>
        </div>
      </>}
      menuItems={deckModuleMenu()}
      renderLanding={type => <LandingCard type={type} />}
      renderItem={(item, parts) => <DeckModule item={item} parts={parts} busy={busy}
        opened={opened === item.id} setOpened={value => setOpened(value ? item.id : null)}
        choosing={choosing === item.id} setChoosing={value => setChoosing(value ? item.id : null)}
        onRemove={() => { modules.splice(modules.findIndex(module => module.id === item.id), 1); refresh(); }}
        onAddFacet={facet => isParentType(item.type) && addFacet(item.id, item.type, facet)}
        onRemoveFacet={facet => removeFacet(item.id, facet)} />} />
    {draft.previewing && <PreviewDialog modules={modules} sampleType={sampleType}
      choose={value => { draft.sampleType = value; refresh(); }}
      close={() => { draft.previewing = false; refresh(); }} />}
  </div>;
}
