import { useEffect, useRef } from 'react';
import { explanationBlocks, facetSampleOf, INPUT_TYPES, sampleKeyOf, sampleOf } from '@vocabularium/domain/explanations';
import { CATALOG, isModuleType } from '@vocabularium/domain/page-modules';
import type { ModuleFamily } from '@vocabularium/domain/page-modules';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import { FamilyIcon } from './families.tsx';
import { Content, Markdown } from './page-view.tsx';

// Explanations (D13, 0.8.1): what a module or a facet contributes and when to
// use it, then its sample for a word and for a sentence, as its card would
// show it, so a user learns it without trying it.

const forWhat = (module: string, inputType: 'word_phrase' | 'sentence') => {
  const key = sampleKeyOf(module, inputType);
  const what = inputType === 'word_phrase' ? 'For a word' : 'For a sentence';
  return key ? `${what}: ${key}` : what;
};

// A module's explanation in a dialog, opened from the link below its + in the
// module window. It never adds the module. Its close button, Escape or a click
// outside closes it, and the focus returns to the link.
export function ModuleExplanation({ type, close }: { type: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  // Closing the dialog first returns the focus to the link that opened it.
  const done = () => { ref.current?.close(); close(); };
  const entry = isModuleType(type) ? CATALOG[type] : null;
  const family: ModuleFamily = entry?.family ?? 'notes';
  const label = entry?.label ?? type;
  const titleId = `about-${type}`;
  return <dialog ref={ref} className={`explanation-dialog fam-${family}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); done(); }}
    onClick={event => { if (event.target === event.currentTarget) done(); }}>
    <div className="explanation-head">
      <span className="fam-chip"><FamilyIcon family={family} /></span>
      <h2 id={titleId}>{label}</h2>
      <button type="button" className="preview-close" aria-label={`Close About ${label}`} onClick={done}>×</button>
    </div>
    <Markdown blocks={explanationBlocks(type)} mainKey="" className="explanation-text" />
    <div className="explanation-samples">
      {INPUT_TYPES.map(inputType => {
        const rendered = sampleOf(type, inputType);
        if (!rendered) return null;
        return <section key={inputType} className="explanation-sample" aria-label={`Sample: ${forWhat(type, inputType)}`}>
          <h3>{forWhat(type, inputType)} <span className="muted">· sample</span></h3>
          <article className={`component preview fam-${family}`} data-type={type}>
            <Content type={type} rendered={rendered} mainKey={sampleKeyOf(type, inputType) ?? ''} />
          </article>
        </section>;
      })}
    </div>
  </dialog>;
}

// A facet's explanation, beneath its row in the facet window: its sentences
// and its part of its module's sample, only for the inputs it applies to.
export function FacetExplanation({ id, parent, facet }: { id: string; parent: ParentType; facet: FacetType }) {
  return <div id={id} className="facet-explanation">
    <Markdown blocks={explanationBlocks(parent, facet)} mainKey="" className="explanation-text" />
    {INPUT_TYPES.map(inputType => {
      const blocks = facetSampleOf(parent, facet, inputType);
      return blocks && <div key={inputType} className="explanation-sample">
        <h4>{forWhat(parent, inputType)} <span className="muted">· sample</span></h4>
        <Markdown blocks={blocks} mainKey={sampleKeyOf(parent, inputType) ?? ''} className="facet-body" />
      </div>;
    })}
  </div>;
}
