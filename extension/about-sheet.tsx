import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { InputType } from '@vocabularium/contracts';
import { facetAbout, facetSamplesOf, familyAbout, moduleAbout, sampleKeyOf, sampleLanguages, sampleOf } from '@vocabularium/domain/about';
import type { FamilyId } from '@vocabularium/domain/catalog';
import { CATALOG, isModuleType, WINDOW_MODULES } from '@vocabularium/domain/page-modules';
import type { ModuleFamily, ModuleType } from '@vocabularium/domain/page-modules';
import { facetsOf, isParentType, PARENTS } from '@vocabularium/domain/parents';
import type { FacetType, ParentType } from '@vocabularium/domain/parents';
import type { Rendered } from '@vocabularium/domain/render';
import { FacetTab } from './facet-tags.tsx';
import { FamilyIcon } from './families.tsx';
import { Content, Markdown } from './page-view.tsx';
import { currentLanguage, LANGUAGES, t } from './i18n.ts';
import { facetMark, facetName, familyLabel, moduleDescription, moduleLabel } from './catalog-text.ts';

// Family, module and facet pages (D20, 0.13.0) in one side sheet over the
// module window, linked by a path at the top: a module page links to its
// facets, a facet page back to its module and on to its siblings. Back
// returns one step; Escape closes the sheet and returns the focus to what
// opened it. A page is the same wherever it opens, in the page view or deck
// settings: it adds nothing and takes nothing from the current card. Its
// samples come from the catalog in the interface language (K63, K66).

export type AboutTarget =
  | { kind: 'family'; family: ModuleFamily }
  | { kind: 'module'; module: string }
  | { kind: 'facet'; module: ParentType; facet: FacetType };

// The sheet is opened from anywhere on the screen: the module window, a card,
// a facet window or deck settings. One sheet listens, in the module window.
let opened: AboutTarget | null = null;
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();
export function openAbout(target: AboutTarget) {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  opened = target;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

const familyOfModule = (module: string) => (isModuleType(module) ? CATALOG[module].family : 'notes') as ModuleFamily;
const familyModules = (family: ModuleFamily) => WINDOW_MODULES.filter(type => CATALOG[type].family === family);
const familiesWithModules = () => [...new Set(WINDOW_MODULES.map(type => CATALOG[type].family as ModuleFamily))];
const isLanguages = (module: string) => familyOfModule(module) === 'translation';
const nameOf = (target: AboutTarget) => target.kind === 'family' ? familyLabel(target.family)
  : target.kind === 'module' ? moduleLabel(target.module) : facetName(target.module, target.facet);
const familyOfTarget = (target: AboutTarget) => target.kind === 'family' ? target.family : familyOfModule(target.module);

export function AboutSheet() {
  const target = useSyncExternalStore(subscribe, () => opened);
  // The pages visited since the sheet opened, the current one last.
  const [trail, setTrail] = useState<AboutTarget[]>([]);
  useEffect(() => { setTrail(target ? [target] : []); }, [target]);
  const page = trail.at(-1);
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (page && dialog && !dialog.open) dialog.showModal();
  }, [page]);
  // A new page starts at its top, with the focus on its heading.
  useEffect(() => { body.current?.scrollTo?.({ top: 0 }); ref.current?.querySelector<HTMLElement>('h2')?.focus(); }, [page]);
  if (!page) return null;
  const close = () => {
    ref.current?.close();
    opened = null;
    setTrail([]);
    const back = opener;
    opener = null;
    back?.focus();
  };
  const go = (next: AboutTarget) => setTrail(current => [...current, next]);
  const back = () => setTrail(current => current.slice(0, -1));
  const family = familyOfTarget(page);
  return <dialog ref={ref} className={`about-sheet fam-${family}`} aria-labelledby="about-sheet-title"
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="about-bar">
      {trail.length > 1 && <button type="button" className="about-back" aria-label={t('about.back')} onClick={back}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>}
      <Path page={page} go={go} />
      <button type="button" className="about-close" aria-label={t('about.close', { name: nameOf(page) })} onClick={close}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
    <div ref={body} className="about-body">
      {/* Each page starts with its own sample controls: a word, in the interface language. */}
      {page.kind === 'family' && <FamilyPage key={`family-${page.family}`} family={page.family} go={go} />}
      {page.kind === 'module' && <ModulePage key={`module-${page.module}-${trail.length}`} module={page.module} go={go} />}
      {page.kind === 'facet' && <FacetPage key={`facet-${page.module}-${page.facet}-${trail.length}`} module={page.module} facet={page.facet} go={go} />}
    </div>
  </dialog>;
}

// Languages / German / Article: each step before the current one opens its page.
function Path({ page, go }: { page: AboutTarget; go: (next: AboutTarget) => void }) {
  const family = familyOfTarget(page);
  const steps: { label: string; target: AboutTarget }[] = [{ label: familyLabel(family), target: { kind: 'family', family } }];
  if (page.kind !== 'family') steps.push({ label: moduleLabel(page.module), target: { kind: 'module', module: page.module } });
  if (page.kind === 'facet') steps.push({ label: facetName(page.module, page.facet), target: page });
  return <nav className="about-path" aria-label={t('about.path')}>
    {steps.map((step, index) => <Fragment key={index}>
      {index > 0 && <span className="about-sep" aria-hidden="true">/</span>}
      {index === steps.length - 1 ? <span aria-current="page">{step.label}</span>
        : <button type="button" onClick={() => go(step.target)}>{step.label}</button>}
    </Fragment>)}
  </nav>;
}

function Hero({ eyebrow, chip, title, lede }: { eyebrow: string; chip: ReactNode; title: string; lede?: string }) {
  return <header className="about-hero">
    <span className="about-eyebrow">{eyebrow}</span>
    <div className="about-title"><span className="about-chip" aria-hidden="true">{chip}</span><h2 id="about-sheet-title" tabIndex={-1}>{title}</h2></div>
    {lede && <p className="about-lede">{lede}</p>}
  </header>;
}

const Chevron = () => <svg className="about-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>;

function FamilyPage({ family, go }: { family: ModuleFamily; go: (next: AboutTarget) => void }) {
  const about = familyAbout(family as FamilyId, currentLanguage());
  const label = familyLabel(family);
  return <>
    <Hero eyebrow={t('about.familyEyebrow')} chip={<FamilyIcon family={family} />} title={label} lede={about?.summary} />
    {about && <section className="about-section">
      <h3>{t('about.everyModule', { family: label })}</h3>
      <ol className="about-steps">
        {about.steps.map((step, index) => <li key={index} data-last={index === about.steps.length - 1 || undefined}>
          <span className="about-num" aria-hidden="true">{index + 1}</span>
          <div><b>{step.title}</b><p>{step.text}</p></div>
        </li>)}
      </ol>
    </section>}
    <section className="about-section">
      <h3>{t('about.modules')}</h3>
      <ul className="about-list">
        {familyModules(family).map(type => <li key={type}>
          <button type="button" className="about-row" onClick={() => go({ kind: 'module', module: type })}>
            <span className="about-chip small" aria-hidden="true"><FamilyIcon family={family} /></span>
            <span><span className="about-row-name">{moduleLabel(type)}</span><span className="about-row-desc">{moduleDescription(type)}</span></span>
            {isParentType(type) ? <span className="about-pill">{t('about.facetCount', { count: facetsOf(type).length })}</span> : <span />}
            <Chevron />
          </button>
        </li>)}
      </ul>
    </section>
    <nav className="about-section" aria-label={t('about.otherFamilies')}>
      <h3>{t('about.otherFamilies')}</h3>
      <div className="about-strip">
        {familiesWithModules().filter(each => each !== family).map(each => <button type="button" key={each} className={`fam-${each}`}
          onClick={() => go({ kind: 'family', family: each })}><span className="about-mark"><FamilyIcon family={each} /></span>{familyLabel(each)}</button>)}
      </div>
    </nav>
  </>;
}

// The sample controls: the key's language (a Languages module's sample comes
// in every interface language) and a word or a sentence.
function useSample(module: string, facet?: FacetType) {
  const languages = sampleLanguages(module, facet).length ? sampleLanguages(module, facet) : sampleLanguages(module);
  const preferred = currentLanguage();
  const [language, setLanguage] = useState<string>(languages.includes(preferred) ? preferred : 'en');
  const [inputType, setInputType] = useState<InputType>('word_phrase');
  return { language, setLanguage, inputType, setInputType, languages };
}
// Each language named in itself, as the settings list it (D21).
const languageName = (code: string) => LANGUAGES.find(language => language.code === code)?.name ?? code;

// The key's language, then the sample's tabs: Word and Sentence, or on a facet
// page with two words their grammatical roles, such as Noun and Adjective (D21).
type SampleTab = Readonly<{ id: string; label: string }>;
const WORD_OR_SENTENCE = (): SampleTab[] => [{ id: 'word_phrase', label: t('about.word') }, { id: 'sentence', label: t('about.sentence') }];
function SampleControls({ sample, chooseLanguage, tabs = WORD_OR_SENTENCE(), current = sample.inputType, choose = id => sample.setInputType(id as InputType), label = t('about.wordOrSentence') }: {
  sample: ReturnType<typeof useSample>; chooseLanguage: boolean;
  tabs?: readonly SampleTab[]; current?: string; choose?: (id: string) => void; label?: string;
}) {
  return <div className="about-controls">
    {chooseLanguage && <span className="about-select">
      <svg className="about-globe" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z" /></svg>
      <select aria-label={t('about.sampleLanguage')} value={sample.language} onChange={event => sample.setLanguage(event.target.value)}>
        {sample.languages.map(code => <option key={code} value={code} lang={code}>{languageName(code)}</option>)}
      </select>
      <svg className="about-select-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
    </span>}
    <div className="about-toggle" role="group" aria-label={label}>
      {tabs.map(tab => <button type="button" key={tab.id} aria-pressed={current === tab.id} onClick={() => choose(tab.id)}>{tab.label}</button>)}
    </div>
  </div>;
}

// A card as the page draws it, its tab naming the module.
function SampleCard({ module, rendered, mainKey, children }: { module: string; rendered: Rendered; mainKey: string; children?: ReactNode }) {
  const family = familyOfModule(module);
  return <article className={`component preview about-card fam-${family}`} data-type={module}>
    <div className="card-tab"><FamilyIcon family={family} /><span className="tab-label">{moduleLabel(module)}</span></div>
    <Content type={module} rendered={rendered} mainKey={mainKey} />
    {children}
  </article>;
}

// Where a card's facet section begins, drawn like a facet's label.
const FacetHint = () => <p className="about-facet-hint">
  <span className="about-hint-head"><span className="about-hint-label"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>{t('about.facets')}</span><span className="about-hint-rule" aria-hidden="true" /></span>
  <span className="about-hint-text">{t('about.facetHint')}</span>
</p>;

function ModulePage({ module, go }: { module: string; go: (next: AboutTarget) => void }) {
  const language = currentLanguage();
  const about = moduleAbout(module, language);
  const family = familyOfModule(module);
  const label = moduleLabel(module);
  const sample = useSample(module);
  const parent = isParentType(module) ? module : null;
  const key = sampleKeyOf(module, sample.inputType, sample.language) ?? '';
  const coreOnly = parent && sampleOf(module, sample.inputType, [], sample.language);
  const whole = parent && sampleOf(module, sample.inputType, undefined, sample.language);
  return <>
    <Hero eyebrow={t('about.moduleEyebrow', { family: familyLabel(family) })} chip={<FamilyIcon family={family} />} title={label} lede={about?.summary} />
    {about?.facts && about.facts.length > 0 && <dl className="about-facts">
      {about.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd><b>{fact.value}</b><span>{fact.note}</span></dd></div>)}
    </dl>}
    {coreOnly && <section className="about-section" aria-labelledby="about-looks">
      <h3 id="about-looks">{t(isLanguages(module) ? 'about.howItLooks' : 'about.seeOnCard')}</h3>
      <SampleControls sample={sample} chooseLanguage={isLanguages(module)} />
      {isLanguages(module) && <p className={`about-key${sample.inputType === 'sentence' ? ' sentence' : ''}`} dir="auto" lang={sample.language}>{key}</p>}
      <SampleCard module={module} rendered={coreOnly} mainKey={key}><FacetHint /></SampleCard>
    </section>}
    {parent && whole?.kind === 'parent' && isLanguages(module) && <section className="about-section" aria-labelledby="about-works">
      <h3 id="about-works">{t('about.howItWorks')}</h3>
      <ol className="about-chain">
        <li><span className="about-chain-label">{t('about.mainKey')}</span><span className="about-chain-value" dir="auto" lang={sample.language}>{key}</span></li>
        {whole.heading && <li><span className="about-chain-label">{t('about.readAs')}</span>
          <span className="about-chain-value about-flags">{whole.heading.labels.map(flag => <span key={flag} className="about-flag">{flag}</span>)}</span></li>}
        <li><span className="about-chain-label">{t('about.moduleCore')}</span><Markdown blocks={whole.core} mainKey="" className="about-chain-core" /></li>
        <li><span className="about-chain-label">{t('about.facets')}</span><span className="about-chain-value about-marks">
          {facetsOf(parent).map(facet => <span key={facet} className="about-mk" data-out={!whole.facets.some(each => each.facet === facet) || undefined}
            title={facetName(parent, facet)}>{facetMark(parent, facet)}</span>)}
        </span></li>
      </ol>
    </section>}
    {parent && <section className="about-section" aria-labelledby="about-facets">
      <h3 id="about-facets">{t('about.facets')}</h3>
      <ul className="about-list">
        {facetsOf(parent).map(facet => {
          const own = facetAbout(parent, facet, language);
          return <li key={facet}><button type="button" className="about-row" onClick={() => go({ kind: 'facet', module: parent, facet })}>
            <span className="about-chip small" aria-hidden="true">{facetMark(parent, facet)}</span>
            <span><span className="about-row-name">{facetName(parent, facet)}</span><span className="about-row-desc">{own?.summary}</span></span>
            <span className="about-pill">{own?.appliesTo}</span>
            <Chevron />
          </button></li>;
        })}
      </ul>
    </section>}
  </>;
}

function FacetSection({ parent, facet, blocks, mainKey }: { parent: ParentType; facet: FacetType; blocks: Parameters<typeof Markdown>[0]['blocks']; mainKey: string }) {
  return <section className="facet about-facet" data-facet={facet}>
    <h4 className="facet-title"><FacetTab parent={parent} facet={facet} /></h4>
    <Markdown blocks={blocks} mainKey={mainKey} className="facet-body" />
  </section>;
}

function FacetPage({ module, facet, go }: { module: ParentType; facet: FacetType; go: (next: AboutTarget) => void }) {
  const language = currentLanguage();
  const about = facetAbout(module, facet, language);
  const label = facetName(module, facet);
  const sample = useSample(module, facet);
  // The cards the samples sit on, the module's and the facet's own: the core
  // and the other facets each holds dimmed, this facet's text in full (0.13.1;
  // until then a separate "Where it sits" followed the sample, and the key and
  // the core stood in a flow above it).
  const samples = facetSamplesOf(module, facet, sample.language);
  const words = samples.filter(each => each.inputType === 'word_phrase');
  const [which, setWhich] = useState(0);
  const roleLabel = (role?: string) => role === 'noun' ? t('about.noun') : role === 'adjective' ? t('about.adjective') : t('about.word');
  const tabs: SampleTab[] = [...(words.length > 1 ? words.map((each, index) => ({ id: `word-${index}`, label: roleLabel(each.role) })) : [{ id: 'word-0', label: t('about.word') }]),
    { id: 'sentence', label: t('about.sentence') }];
  const current = sample.inputType === 'sentence' ? 'sentence' : `word-${Math.min(which, Math.max(words.length - 1, 0))}`;
  const choose = (id: string) => {
    if (id === 'sentence') { sample.setInputType('sentence'); return; }
    sample.setInputType('word_phrase');
    setWhich(Number(id.slice('word-'.length)));
  };
  const chosen = sample.inputType === 'sentence' ? samples.find(each => each.inputType === 'sentence') : words[Math.min(which, words.length - 1)];
  const key = chosen?.key ?? sampleKeyOf(module, sample.inputType, sample.language, facet) ?? '';
  const card = chosen?.card;
  const blocks = card?.facets.find(each => each.facet === facet)?.body;
  const shown = card?.facets.map(each => each.facet) ?? [];
  const applies = PARENTS[module].facets[facet]?.applies ?? [];
  const family = familyOfModule(module);
  return <>
    <Hero eyebrow={t('about.facetEyebrow', { module: moduleLabel(module) })} chip={facetMark(module, facet)} title={label} lede={about?.summary} />
    {about && <dl className="about-defs">
      <dt>{t('about.appliesTo')}</dt><dd><span className="about-applies">{about.appliesTo}</span></dd>
      <dt>{t('about.describes')}</dt><dd>{about.describes}</dd>
    </dl>}
    <section className="about-section" aria-labelledby="about-samples">
      <h3 id="about-samples">{t('about.samples')}</h3>
      <SampleControls sample={sample} chooseLanguage={isLanguages(module)} tabs={tabs} current={current} choose={choose} label={t('about.samples')} />
      <p className={`about-key${sample.inputType === 'sentence' ? ' sentence' : ''}`} dir="auto" lang={sample.language}>{key}</p>
      {card && blocks ? <>
        <article className={`component preview about-card about-where fam-${family}`} data-type={module}>
          <div className="card-tab"><FamilyIcon family={family} /><span className="tab-label">{moduleLabel(module)}</span></div>
          <div className="about-dim"><Content type={module} rendered={{ ...card, facets: [] }} mainKey={key} /></div>
          {facetsOf(module).filter(each => shown.includes(each)).map(each => each === facet
            ? <div key={each} className="about-here"><FacetSection parent={module} facet={facet} blocks={blocks} mainKey={key} /></div>
            : <div key={each} className="about-dim about-other" aria-hidden="true"><FacetTab parent={module} facet={each} /></div>)}
        </article>
      </> : <p className="about-left-out"><span className="about-mk" data-out aria-hidden="true">{facetMark(module, facet)}</span>
        {applies.includes(sample.inputType) ? t('about.noSample') : t('about.leftOut', { facet: label })}</p>}
    </section>
    <nav className="about-section" aria-label={t('about.facetsOf', { module: moduleLabel(module) })}>
      <h3>{t('about.facetsOf', { module: moduleLabel(module) })}</h3>
      <div className="about-strip">
        {facetsOf(module).map(each => each === facet
          ? <span key={each} className="about-strip-current" aria-current="page"><span className="about-mark">{facetMark(module, each)}</span>{facetName(module, each)}</span>
          : <button type="button" key={each} onClick={() => go({ kind: 'facet', module, facet: each })}><span className="about-mark">{facetMark(module, each)}</span>{facetName(module, each)}</button>)}
      </div>
    </nav>
  </>;
}
