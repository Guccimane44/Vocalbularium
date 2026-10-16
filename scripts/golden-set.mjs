// Runs the parent modules' golden set (D08, C8) against the live provider and
// writes the outputs for the owner's review. It calls OpenCodeProvider
// directly, without the API, database or extension, and spends provider usage.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { generateComponent } from '@vocabularium/domain/modules';
import { facetsOf, PARENTS } from '@vocabularium/domain/parents';
import { filledFacets } from '@vocabularium/domain/content';

if (!process.env.OPENCODE_API_KEY) throw new Error('Configure OPENCODE_API_KEY in the ignored .env file first.');
const only = process.argv[2];
const { inputs } = JSON.parse(await readFile(new URL('../tests/golden/parents.json', import.meta.url), 'utf8'));
const provider = new OpenCodeProvider();
const evidence = { date: new Date().toISOString(), provider: 'OpenCode Go', model: provider.model, results: [] };
for (const input of inputs) {
  const sessionId = randomUUID();
  let interpretation;
  try { interpretation = await provider.interpret(input.key, undefined, sessionId, input.context); }
  catch (error) { evidence.results.push({ ...input, error: `interpretation: ${error.message}` }); continue; }
  for (const type of Object.keys(PARENTS).filter(type => !only || type === only)) {
    const module = { id: `golden-${type}`, type, facets: facetsOf(type) };
    // Kept so a failed output can be read in the review, not only its error.
    let raw = null;
    try {
      // Structured content (D09): the core and one entry per facet with content.
      const content = await generateComponent({ mainKey: input.key, interpretation, module,
        generate: async request => (raw = await provider.generate({ ...request, context: input.context, sessionId })) });
      evidence.results.push({ ...input, parent: type, inputType: interpretation.inputType, content, facets: filledFacets(type, content) });
    } catch (error) {
      evidence.results.push({ ...input, parent: type, inputType: interpretation.inputType, error: error.message, ...(raw ? { content: raw } : {}) });
    }
  }
}
const json = value => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
const stamp = evidence.date.replace(/[:.]/g, '-');
await mkdir('.data/golden', { recursive: true });
await writeFile(`.data/golden/${stamp}.json`, JSON.stringify(evidence, null, 2) + '\n');
const review = [`# Golden set ${evidence.date}`, '', `Model: ${evidence.model}`, '',
  ...evidence.results.flatMap(result => [`## ${result.parent ? `${PARENTS[result.parent].label}: ` : ''}${result.key}`, '',
    `${result.why}${result.context ? ` · Context: ${result.context}` : ''}${result.inputType ? ` · read as ${result.inputType}` : ''}`, '',
    result.error ? `**Failed:** ${result.error}${result.content ? `\n\n${json(result.content)}` : ''}` : `Facets shown: ${result.facets.join(', ') || 'none'}\n\n${json(result.content)}`, ''])].join('\n');
await writeFile(`.data/golden/${stamp}.md`, review);
const failed = evidence.results.filter(result => result.error).length;
console.log(`Golden set finished: ${evidence.results.length - failed} outputs, ${failed} failures. Review .data/golden/${stamp}.md.`);
