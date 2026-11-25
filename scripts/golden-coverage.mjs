// @ts-check
// Prints each failure point of a module's golden folder with its items by
// band and split, the reading part's spread, and the set's gaps.
// Usage: npm run golden:coverage -- <module>
import { isContentModule } from '@vocabularium/domain/catalog';
import { moduleSet } from './golden-sets.mjs';

const [module] = process.argv.slice(2);
if (!module || !isContentModule(module)) throw new Error('Name a content module: npm run golden:coverage -- german');
const set = moduleSet(module);
const BANDS = ['common', 'middle', 'rare'];
/** @param {readonly { split: string }[]} items @param {string} split */
const count = (items, split) => items.filter(item => item.split === split).length;
const lines = ['| Facet | Point | Items | Dev | Test | Common | Middle | Rare | Reading |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...set.coverage.map(({ facet, point, items }) => `| ${facet} | ${point.id}${point.abstain ? ' ∅' : ''} | ${items.length} | ${count(items, 'dev')} | ${count(items, 'test')} | ${
    BANDS.map(band => point.noWordsIn[/** @type {'common' | 'middle' | 'rare'} */ (band)] ? '–' : items.filter(item => item.band === band).length).join(' | ')} | ${items.filter(item => item.part !== 'knowledge').length} |`),
  '', `Items: ${set.items.length} (${set.items.filter(item => item.retired).length} retired) · ${['knowledge', 'reading', 'sample'].map(part => `${part} ${set.items.filter(item => item.part === part).length}`).join(', ')}`,
  `References: ${set.references.size} words, ${[...set.references.values()].filter(reference => reference.checked === null).length} unchecked`,
  '', set.gaps.length ? `${set.gaps.length} gaps:` : 'No gaps.', ...set.gaps.map(gap => `- ${gap.message}`)];
console.log(lines.join('\n'));
