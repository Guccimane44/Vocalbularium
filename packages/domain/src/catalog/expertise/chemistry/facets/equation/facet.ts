import { defineFacet, displayMath, escapeMarkdown, inlineMath, list, object, text } from '../../../../blocks.js';

// The concept's chemical formula or balanced reaction equation as display
// math in mhchem notation (`\ce{2H2 + O2 -> 2H2O}`), then each substance in it
// with its name (D30). Only for a key of the subject that the core says has
// one; never constructed for one that has none.
export default defineFacet({
  id: 'equation', label: 'Equation', abbreviation: 'Eq', description: 'The chemical formula or balanced reaction equation of a chemistry concept, with its substances named.',
  applies: ['word_phrase', 'sentence'], output: 'text',
  when: core => core.relevance === 'subject' && core.hasEquation === 'yes',
  shape: object({ latex: text('the equation'), species: list(object({ symbol: text('the substance'), name: text('the name') }), { name: 'the species', each: 'Substance' }) }),
  format: value => [displayMath(value.latex), value.species.map(item => `- ${inlineMath(item.symbol)} · ${escapeMarkdown(item.name)}`).join('\n')].join('\n\n'),
  checks: [{
    id: 'mhchem', description: 'The equation is written in mhchem notation, inside \\ce{}.',
    test: value => /\\ce\s*\{/.test(value.latex) ? null : 'the equation is not inside \\ce{}'
  }, {
    id: 'balanced', description: 'A simple reaction, without charges, states or conditions, has the same count of each element on both sides.',
    test: value => {
      const sides = reactionSides(value.latex);
      if (!sides) return null;
      const [left, right] = sides.map(side => side ? sideCount(side) : null);
      if (!left || !right) return null;
      const elements = [...new Set([...left.keys(), ...right.keys()])].sort();
      const off = elements.filter(element => (left.get(element) ?? 0) !== (right.get(element) ?? 0));
      return off.length ? `not balanced: ${off.map(element => `${element} ${left.get(element) ?? 0} → ${right.get(element) ?? 0}`).join(', ')}` : null;
    }
  }, {
    id: 'species-only', description: 'The species list names substances, never an arrow, a plus sign or a bare coefficient.',
    test: value => value.species.map(item => {
      const inner = unwrap(item.symbol.trim()).trim();
      return /(->|<-|<=>|<->|=)/.test(inner) || /^[+\d.\s]*$/.test(inner) || /^\d+\s*[A-Z(]/.test(inner) || /\s\+\s/.test(inner)
        ? `"${item.symbol}" is not a single substance without its coefficient` : null;
    }).find(Boolean) ?? null
  }]
});

// The content of the first \ce{...}, its braces matched.
function unwrap(latex: string): string {
  const start = latex.search(/\\ce\s*\{/);
  if (start < 0) return latex;
  let depth = 0;
  const open = latex.indexOf('{', start);
  for (let index = open; index < latex.length; index++) {
    if (latex[index] === '{') depth++;
    else if (latex[index] === '}' && --depth === 0) return latex.slice(open + 1, index);
  }
  return latex.slice(open + 1);
}

// The two sides of a simple reaction (one forward or equilibrium arrow, no
// arrow labels), or null for a formula, a charged or stated species, or
// anything the count below cannot read: the check only judges what it can.
function reactionSides(latex: string): [string, string] | null {
  const inner = unwrap(latex);
  if (/[\^()[\]{}\\]|\s[a-z]/.test(inner)) return null;
  const parts = inner.split(/\s*(?:->|<=>|<-->|<->|=)\s*/);
  return parts.length === 2 && parts[0] && parts[1] ? [parts[0], parts[1]] : null;
}

// Each element's atom count over one side's substances, each with its
// coefficient; null when a term is not a plain formula such as 2H2O.
function sideCount(side: string): Map<string, number> | null {
  const counts = new Map<string, number>();
  for (const term of side.split(/\s+\+\s+/)) {
    const match = /^(\d*)\s*((?:[A-Z][a-z]?\d*)+)$/.exec(term.trim());
    if (!match) return null;
    const coefficient = match[1] ? Number(match[1]) : 1;
    for (const [, element, count] of (match[2] ?? '').matchAll(/([A-Z][a-z]?)(\d*)/g)) {
      counts.set(element!, (counts.get(element!) ?? 0) + coefficient * (count ? Number(count) : 1));
    }
  }
  return counts;
}
