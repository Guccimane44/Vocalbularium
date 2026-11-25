// @ts-check
// The owner's review of a module's messy cards (v0.17.0 step 2): captures with
// no right answer, which only the owner can grade. `write` lays one part's cards
// out in a Markdown file, each under a letter, with no model named, so the
// verdict is not swayed by which model wrote it; `read` takes the filled file
// back into the module's calibration file as whole cards decided by the owner.
// Rerunning `read` replaces the cards it wrote before.
// Usage: npm run calibration:review -- write <module> <dev|held-out> <golden run .json>...
//        npm run calibration:review -- read <module> <dev|held-out>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { isContentModule } from '@vocabularium/domain/catalog';
import { moduleSet } from './golden-sets.mjs';
import { readCalibration } from './calibration.mjs';

// The core's failure points that make a capture messy (step 1's plan).
const MESSY = ['slang', 'typo', 'fragment', 'coined', 'colloquial', 'noise'];
const LETTERS = 'ABCDEFGH';

const [command, module, part, ...runs] = process.argv.slice(2);
if (!['write', 'read'].includes(command ?? '') || !module || !isContentModule(module) || !['dev', 'held-out'].includes(part ?? '')) {
  throw new Error('Usage: calibration:review -- write <module> <dev|held-out> <golden run .json>... | read <module> <dev|held-out>');
}
const review = `.data/calibration/review-${module}-messy-${part}`;
const calibrationFile = `tests/golden/calibration/${module}.json`;

if (command === 'write') {
  if (!runs.length) throw new Error('Name the golden runs whose cards to review.');
  const split = part === 'held-out' ? 'test' : 'dev';
  const items = moduleSet(module).items.filter(item => item.split === split && !item.retired && (item.fills.core ?? []).some(point => MESSY.includes(point)));
  /** @type {any[]} */
  const loaded = await Promise.all(runs.map(async file => JSON.parse(await readFile(file, 'utf8'))));
  /** @type {Record<string, any>} the cards behind each code, kept beside the review for `read` */
  const cards = {};
  const sections = [];
  for (const item of items) {
    const outputs = loaded.flatMap(run => run.results.filter((/** @type {any} */ result) => result.id === item.id && result.json?.core).map((/** @type {any} */ result) => ({ run, result })));
    if (outputs.length !== runs.length) throw new Error(`${item.id} has ${outputs.length} cards in the runs given, not ${runs.length}; rerun the model that is missing it.`);
    // A fixed order per item that does not follow the runs' order, so a letter never stands for one model.
    const order = [...outputs].sort((a, b) => hash(`${item.id}${a.run.model}`) - hash(`${item.id}${b.run.model}`));
    for (const [index, { run, result }] of order.entries()) {
      const code = `${item.id} ${LETTERS[index]}`;
      cards[code] = { item: item.id, key: item.key, ...(item.context ? { context: item.context } : {}), language: run.language, generator: run.model.replace(/ \(subagent\)$/, ''), card: { core: result.json.core, facets: Object.fromEntries(Object.entries(result.json.facets ?? {}).filter(([facet]) => result.facets.includes(facet))) } };
      sections.push([`## ${code}`, '', `**Capture:** ${item.key}${item.context ? `  \n**Context:** ${item.context}` : ''}`, '',
        '```markdown', result.content.core, '```', '',
        '<details><summary>Facets</summary>', '', ...Object.entries(result.content.facets).flatMap(([facet, text]) => [`**${facet}**`, '', String(text), '']), '</details>', '',
        'Verdict: ', 'Reason: ', ''].join('\n'));
    }
  }
  await mkdir('.data/calibration', { recursive: true });
  await writeFile(`${review}.json`, JSON.stringify(cards, null, 2) + '\n');
  await writeFile(`${review}.md`, [`# ${module}: messy captures, ${part} part`, '',
    `${Object.keys(cards).length} cards: ${items.length} messy captures, each turned into a card by ${runs.length} different models. A and B hide which model wrote which card.`, '',
    'A messy capture is what a user might really select: slang, a typo, half a word, a made-up word, everyday speech, or a word with noise around it (a hashtag, an emoji). The code before the word says which: slang, typo, frag (a broken selection), coined, coll (everyday speech), noise. There is no dictionary answer, so your view decides.', '',
    'Under each card, write one word after "Verdict:": **pass** (a card you would be happy to get), **weak** (usable, but something is off) or **fail** (misleading or useless). Then one line after "Reason:" saying why. The reasons matter most: they become the rules the judge uses for messy captures.', '',
    'Each card shows its meaning first. Click "Facets" to see the rest (examples, synonyms, word origin and so on).', '',
    ...sections].join('\n'));
  console.log(`Wrote ${review}.md: ${Object.keys(cards).length} cards to grade.`);
} else {
  /** @type {Record<string, any>} */
  const cards = JSON.parse(await readFile(`${review}.json`, 'utf8'));
  const text = await readFile(`${review}.md`, 'utf8');
  const graded = [...text.matchAll(/^## (.+)\n[\s\S]*?^Verdict: *(.*)\n^Reason: *(.*)$/gm)].map(([, code = '', verdict = '', reason = '']) => ({ code, verdict: verdict.trim().toLowerCase(), reason: reason.trim() }));
  const open = graded.filter(each => !['pass', 'weak', 'fail'].includes(each.verdict) || !each.reason);
  if (open.length || graded.length !== Object.keys(cards).length) throw new Error(`${review}.md: ${open.length} of ${Object.keys(cards).length} cards still need a verdict and a reason (${open.slice(0, 5).map(each => each.code).join(', ')}${open.length > 5 ? ', …' : ''}).`);
  const set = JSON.parse(await readFile(calibrationFile, 'utf8'));
  const written = graded.map(({ code, verdict, reason }) => {
    const { item, generator, ...rest } = cards[code];
    return { id: `messy-${item}-${generator.replace(/^claude-|-\d.*$/g, '')}`, item, split: part, generator, decided: 'owner', verdict, reason, ...rest };
  });
  const ids = new Set(written.map(card => card.id));
  set.cards = [...set.cards.filter((/** @type {any} */ card) => !ids.has(card.id)), ...written];
  await readCalibration(calibrationFile, set);
  await writeFile(calibrationFile, JSON.stringify(set, null, 2) + '\n');
  console.log(`${calibrationFile}: ${written.length} messy cards from the owner's review.`);
}

/** A small stable hash, for an order that is fixed but not the runs' order. @param {string} text */
function hash(text) {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) | 0;
  return value;
}
