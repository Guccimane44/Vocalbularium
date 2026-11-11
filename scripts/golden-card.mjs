// @ts-nocheck: the golden set's untyped JSON, as scripts/golden-set.mjs.
// One golden input on one module, as the golden set (scripts/golden-set.mjs)
// and the silver set (scripts/silver-set.mjs) both run it: the card, its flags
// against the input's expectation, and the catalog's content checks.
import { generateComponent } from '@vocabularium/domain/modules';
import { facetsOf } from '@vocabularium/domain/parents';
import { filledFacets } from '@vocabularium/domain/content';
import { checkCard } from '@vocabularium/domain/checks';
import { checkTools } from './check-tools.mjs';

// A transient service error (such as a rate limit) is tried once more after a
// pause, so the review shows the prompt's results rather than the service's.
export async function steady(call) {
  try { return await call(); }
  catch (error) {
    if (error.code !== 'provider_response') throw error;
    await new Promise(resolve => setTimeout(resolve, 10000));
    return call();
  }
}

// The flags a card's top line records, against the input's expectation (D17,
// K50): `kind` and a German `gramRole` for Languages, `relevance` and `hasFormula`, `hasCode` or `hasEquation` for Expertise,
// `language` for Pronunciation and Creativity (D24, D30); and whether a Languages card gave a meaning in
// this Context (D29).
export function flagsOf(header) {
  if (header.kind === 'pronunciation' || header.kind === 'creativity') return { language: header.language };
  return header.kind === 'expertise' ? { relevance: header.relevance, ...(header.hasFormula ? { hasFormula: header.hasFormula } : {}), ...(header.hasCode ? { hasCode: header.hasCode } : {}), ...(header.hasEquation ? { hasEquation: header.hasEquation } : {}) }
    : { kind: header.kind, ...(header.gramRole ? { gramRole: header.gramRole.toLowerCase() } : {}) };
}
// And, where the input names them, whether a facet is shown on a module's card,
// such as Chinese Grammar teacher only for a Chinese key (0.16.4).
export function unexpected(type, flags, expect = {}, context, shown = []) {
  const wanted = { ...(expect.kind ? { kind: expect.kind } : {}), ...(expect.relevance ? { relevance: expect.relevance } : {}),
    ...(expect.hasFormula ? { hasFormula: expect.hasFormula } : {}), ...(expect.hasCode ? { hasCode: expect.hasCode } : {}), ...(expect.hasEquation ? { hasEquation: expect.hasEquation } : {}),
    ...(expect.language ? { language: expect.language } : {}),
    ...(expect.gramRole?.[type] ? { gramRole: expect.gramRole[type] } : {}),
    // A Languages word's meaning in this Context (D29): never without a Context.
    ...('contextual' in flags ? { contextual: expect.contextual ?? (context ? undefined : false) } : {}) };
  const facets = Object.entries(expect.facets?.[type] ?? {}).filter(([facet, wantedShown]) => shown.includes(facet) !== wantedShown)
    .map(([facet, wantedShown]) => `${facet}: ${wantedShown ? 'not shown, expected shown' : 'shown, expected left out'}`);
  return [...Object.entries(wanted).filter(([flag, value]) => value !== undefined && flags[flag] !== value).map(([flag, value]) => `${flag}: ${flags[flag] ?? 'none'}, expected ${value}`), ...facets];
}

// The result the golden set records for one input on one module: the card and
// what was found wrong with it, or the error that stopped it.
export async function runCard({ provider, input, type, language, sample, sessionId }) {
  const module = { id: `golden-${type}`, type, facets: facetsOf(type) };
  // Kept so a failed output can be read in the review, not only its error.
  let raw = null;
  const mismatches = [];
  try {
    // One request writes the card (D17): the model's JSON (D09), and the markdown per facet it is stored as.
    const content = await generateComponent({ mainKey: input.key, module, onMismatch: ({ facet }) => mismatches.push(facet),
      generate: async request => (raw = await steady(() => provider.generate({ ...request, context: input.context, language, sessionId }))) });
    const flags = { ...flagsOf(content.header), ...(content.header.kind === 'word' || content.header.kind === 'sentence' ? { contextual: Boolean(raw?.core?.contextual) } : {}) };
    // The catalog's content checks on the card as the model wrote it (0.16.0), its
    // dropped facets aside: a facet its flags rule out never reaches the user (D17).
    const shown = filledFacets(type, content);
    const { failures: checks, skipped } = await checkCard(type, { ...raw, facets: Object.fromEntries(Object.entries(raw.facets ?? {}).filter(([facet]) => shown.includes(facet))) }, checkTools);
    return { ...input, sample, parent: type, flags, unexpected: unexpected(type, flags, input.expect, input.context, shown), mismatches, checks, skipped, json: raw, content, facets: shown };
  } catch (error) {
    return { ...input, sample, parent: type, error: error.message, ...(raw ? { content: raw } : {}) };
  }
}
