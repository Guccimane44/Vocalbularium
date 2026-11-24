// @ts-check
// Reads the grammar line of a DWDS entry page (dwds.de/wb/<word>) and
// compares a golden reference's key cells with it, for golden:draft --check.
// Nouns: gender, genitive singular, plural. Verbs: er/sie/es in the Präsens and
// Präteritum, the Perfekt's auxiliary and participle. Adjectives: comparative,
// superlative, whether it declines.

const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', times: '×' });
const GENUS = /** @type {Record<string, string>} */ ({ Maskulinum: 'der', Femininum: 'die', Neutrum: 'das' });
const MARKS = /^(umgangssprachlich|selten|veraltet|landschaftlich|regional|meist umgangssprachlich|besonders \S+)\s+(.*)$/;

/** @typedef {{ facet: string, cell: string, note: string }} Disagreement */

/**
 * The text of each "Form / Grammatik" block on an entry page, one per entry
 * (Kiefer has der Kiefer and die Kiefer).
 * @param {string} html @returns {string[]}
 */
export function grammarLines(html) {
  return [...html.matchAll(/dwdswb-ft-blocks-wrapper[^>]*>/g)].map(match => {
    const start = /** @type {number} */ (match.index) + match[0].length;
    const text = html.slice(start, start + 5000).replace(/<[^>]+>/g, ' ')
      .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (entity, decimal, hex, name) => decimal ? String.fromCodePoint(Number(decimal)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name] ?? entity)
      .replace(/\s+/g, ' ');
    return text.split(/Aussprache|Worttrennung|Wortbildung|Bedeutungs/)[0].trim();
  });
}

/**
 * The forms one cell of the line gives, each with DWDS's mark if it has one:
 * "Gott(e)s" gives Gotts and Gottes, "Keks / Kekses" both, "selten Herren" a marked form.
 * @param {string} text @returns {{ form: string, mark: string }[]}
 */
function variants(text) {
  return text.trim().split(/\s*\/\s*/).flatMap(part => {
    const marked = MARKS.exec(part);
    const [mark, rest] = marked ? [marked[1], marked[2]] : ['', part];
    const optional = /^(.*?)\((\p{L}+)\)(\p{L}*)$/u.exec(rest);
    const forms = optional ? [optional[1] + optional[3], optional[1] + optional[2] + optional[3]] : [rest];
    return forms.map(form => ({ form: form.trim(), mark })).filter(each => each.form);
  });
}

/** Every form a named field gives, "Genitiv Singular 2: selten Herren" included. @param {string} line @param {string} name */
const field = (line, name) => [...line.matchAll(new RegExp(`${name}(?: \\d)?: ([^·]+)`, 'g'))].flatMap(match => variants(match[1].replace(/ ,/g, ',').split(',')[0]));
const plain = (/** @type {{ form: string, mark: string }[]} */ forms) => new Set(forms.filter(each => !each.mark).map(each => each.form));
const sorted = (/** @type {Iterable<string>} */ forms) => JSON.stringify([...forms].sort());
const same = (/** @type {Set<string>} */ a, /** @type {Set<string>} */ b) => a.size === b.size && [...a].every(each => b.has(each));
const within = (/** @type {Set<string>} */ a, /** @type {Set<string>} */ b) => [...a].every(each => b.has(each));
/** @param {unknown} facet @returns {any[]} */
const alternatives = facet => Array.isArray(facet) ? facet : [];

/**
 * Where a reference's key cells disagree with the grammar lines of its
 * lemma's entry page. Each names the facet and cell a dispute would decide.
 * A word with senses ("Kiefer#Baum") is compared with the entries that agree
 * on its gender or its Präsens, so the other homograph is not held against it.
 * @param {string} word @param {any} reference @param {string[]} lines @returns {Disagreement[]}
 */
export function disagreements(word, reference, lines) {
  const lemma = word.split('#')[0];
  if (reference.pos === 'noun') return noun(reference, lines.filter(line => line.includes('Substantiv')));
  if (reference.pos === 'verb') return verb(lemma, reference, lines.filter(line => /\bVerb\b/.test(line)));
  if (reference.pos === 'adjective') return adjective(reference, lines.filter(line => line.includes('Adjektiv')));
  return [];
}

/** @param {string} line */
const gendersOf = line => [...line.matchAll(/\((Maskulinum|Femininum|Neutrum)\)/g)].map(match => GENUS[match[1]]);

/** @param {any} reference @param {string[]} lines @returns {Disagreement[]} */
function noun(reference, lines) {
  if (!lines.length) return [{ facet: 'article', cell: '*', note: 'DWDS has no noun entry' }];
  const found = /** @type {Disagreement[]} */ ([]);
  const articles = alternatives(reference.article);
  const ours = new Set(articles.flatMap(each => each.singular.map((/** @type {string} */ form) => form.split(' ')[0])));
  const all = new Set(lines.flatMap(gendersOf));
  if (all.size && !within(ours, all)) found.push({ facet: 'article', cell: 'singular', note: `ours ${sorted(ours)}, DWDS genders ${sorted(all)}` });
  const matching = lines.filter(line => gendersOf(line).some(gender => ours.has(gender)));
  const entries = matching.length ? matching : lines;
  const genders = new Set(entries.flatMap(gendersOf));

  if (articles.length) {
    const ourPlurals = new Set(articles.flatMap(each => each.plural.filter((/** @type {string} */ form) => form.includes(' ')).map((/** @type {string} */ form) => form.split(' ').slice(1).join(' '))));
    const theirs = plain(entries.flatMap(line => field(line, 'Nominativ Plural')));
    if (entries.some(line => line.includes('nur im Singular')) && ourPlurals.size) found.push({ facet: 'article', cell: 'plural', note: `ours ${sorted(ourPlurals)}, DWDS singular only` });
    else if (theirs.size && !(ourPlurals.size && within(ourPlurals, theirs))) found.push({ facet: 'article', cell: 'plural', note: `ours ${sorted(ourPlurals)}, DWDS ${sorted(theirs)}` });
  }

  // An alternative in a gender DWDS does not give is the article dispute's to decide, its genitive with it.
  const declensions = alternatives(reference.declension);
  const kept = declensions.filter(each => genders.has(each.Singular?.Nominativ?.[0]?.split(' ')[0]));
  const ourGenitives = new Set((kept.length ? kept : declensions).flatMap(each => (each.Singular?.Genitiv ?? []).filter((/** @type {string} */ form) => form.includes(' ')).map((/** @type {string} */ form) => form.split(' ').slice(1).join(' '))));
  const theirGenitives = plain(entries.flatMap(line => field(line, 'Genitiv Singular')));
  if (declensions.length && theirGenitives.size && !same(ourGenitives, theirGenitives)) found.push({ facet: 'declension', cell: 'Singular|Genitiv', note: `ours ${sorted(ourGenitives)}, DWDS ${sorted(theirGenitives)}` });
  return found;
}

/** @param {string} lemma @param {any} reference @param {string[]} lines @returns {Disagreement[]} */
function verb(lemma, reference, lines) {
  const conjugation = alternatives(reference.conjugation);
  // DWDS names the plain verb: "freut", not "freut sich".
  /** @param {string} tense */
  const ours = tense => new Set(conjugation.flatMap(each => (each[tense]?.['er/sie/es'] ?? []).map((/** @type {string} */ form) => form.replace(/ sich\b/, ''))));
  const parsed = lines.flatMap(line => {
    const match = /Verb · (?:reflexiv )?(.+?)(?: · Konjugationstabelle|$)/.exec(line);
    const parts = match?.[1].split(' , ').map(part => part.trim()) ?? [];
    return parts.length >= 3 ? [{ line, Präsens: parts[0], Präteritum: parts[1], Perfekt: parts[2] }] : [];
  });
  if (!parsed.length) return [{ facet: 'conjugation', cell: '*', note: `DWDS has no verb line we can read${lines.length ? `: ${lines.join(' || ')}` : ''}` }];
  const options = (/** @type {string} */ text) => new Set(text.split('/').map(each => each.replace(/ sich\b/, '').trim()));
  const present = ours('Präsens');
  const matching = parsed.filter(entry => [...options(entry.Präsens)].some(form => present.has(form)));
  const found = /** @type {Disagreement[]} */ ([]);
  for (const entry of matching.length ? matching : parsed) {
    for (const tense of /** @type {const} */ (['Präsens', 'Präteritum'])) {
      const theirs = options(entry[tense]);
      if (!within(theirs, ours(tense))) found.push({ facet: 'conjugation', cell: `${tense}|er/sie/es`, note: `ours ${sorted(ours(tense))}, DWDS ${entry[tense]}` });
    }
    const perfect = /^(ist \/ hat|hat \/ ist|ist|hat) (.*)$/.exec(entry.Perfekt.replace(/ sich\b/, ''));
    if (!perfect) { found.push({ facet: 'conjugation', cell: 'Perfekt|er/sie/es', note: `DWDS Perfekt not read: ${entry.Perfekt}` }); continue; }
    // "hat gewollt / wollen": the second is the substitute infinitive, used only beside another infinitive.
    const participles = perfect[2].split(' / ').filter((participle, _, all) => all.length === 1 || participle !== lemma);
    const theirs = new Set(perfect[1].split(' / ').flatMap(auxiliary => participles.map(participle => `${auxiliary} ${participle}`)));
    if (!same(theirs, ours('Perfekt'))) found.push({ facet: 'conjugation', cell: 'Perfekt|er/sie/es', note: `ours ${sorted(ours('Perfekt'))}, DWDS ${entry.Perfekt}` });
  }
  return found;
}

/** @param {any} reference @param {string[]} lines @returns {Disagreement[]} */
function adjective(reference, lines) {
  if (!lines.length) return [{ facet: 'comparison', cell: '*', note: 'DWDS has no adjective entry' }];
  const found = /** @type {Disagreement[]} */ ([]);
  const { comparison, declension } = reference;
  for (const line of lines) {
    const degrees = /Komparativ: ([^·]+?) · Superlativ: ([^·,]+)(.*)/.exec(line);
    if (line.includes('ohne Steigerung') && comparison !== 'none') found.push({ facet: 'comparison', cell: '*', note: `ours ${JSON.stringify(comparison)}, DWDS ohne Steigerung` });
    // A line that names no degrees at all (hurtig) leaves the comparison to Wiktionary.
    if (degrees && comparison === 'none') found.push({ facet: 'comparison', cell: '*', note: `ours none, DWDS ${degrees[1].trim()}, ${degrees[2].trim()}${degrees[3].includes('Steigerung selten') ? ' (Steigerung selten)' : ''}` });
    if (degrees && Array.isArray(comparison)) {
      for (const [cell, text] of /** @type {const} */ ([['comparative', degrees[1]], ['superlative', degrees[2]]])) {
        const ours = new Set(comparison.flatMap(each => each[cell] ?? []));
        const theirs = new Set(text.split('/').map(each => each.trim()));
        if (!same(ours, theirs)) found.push({ facet: 'comparison', cell, note: `ours ${sorted(ours)}, DWDS ${sorted(theirs)}` });
      }
    }
    const indeclinable = line.includes('indeklinabel');
    if (indeclinable !== (declension === 'none')) found.push({ facet: 'declension', cell: '*', note: indeclinable ? 'ours a table, DWDS indeclinable' : 'ours none, DWDS declines' });
    const attributive = /attributive Form: (\p{L}+)/u.exec(line);
    const weak = Array.isArray(declension) ? declension[0].Femininum?.['schwach Nominativ'] ?? [] : null;
    if (attributive && weak && !weak.includes(attributive[1])) found.push({ facet: 'declension', cell: 'Femininum|schwach Nominativ', note: `ours ${sorted(weak)}, DWDS attributive form ${attributive[1]}` });
  }
  return found;
}

/**
 * Whether a dispute decides a disagreement: same facet, and its cell is the
 * same or covers it ("Perfekt|*" covers "Perfekt|er/sie/es", "*" covers all).
 * @param {{ facet: string, cell: string }} dispute @param {Disagreement} disagreement
 */
export function decides(dispute, disagreement) {
  if (dispute.facet !== disagreement.facet) return false;
  const ours = disagreement.cell.split('|');
  const theirs = dispute.cell.split('|');
  for (const [index, part] of theirs.entries()) {
    if (part === '*') return true;
    if (part !== ours[index]) return false;
  }
  return theirs.length === ours.length;
}
