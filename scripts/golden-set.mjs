// Runs the parent modules' golden set (D08, C8) against the live provider and
// writes the outputs for the owner's review. It calls OpenCodeProvider
// directly, without the API, database or extension, and spends provider usage.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { generateComponent } from '@vocabularium/domain/modules';
import { facetsOf, PARENTS } from '@vocabularium/domain/parents';
import { renderContent } from '@vocabularium/domain/render';

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
      const text = await generateComponent({ mainKey: input.key, interpretation, module,
        generate: async request => (raw = await provider.generate({ ...request, context: input.context, sessionId })) });
      const rendered = renderContent(type, text);
      evidence.results.push({ ...input, parent: type, inputType: interpretation.inputType, text,
        facets: rendered.kind === 'parent' ? rendered.facets.map(facet => facet.facet) : null });
    } catch (error) {
      evidence.results.push({ ...input, parent: type, inputType: interpretation.inputType, error: error.message, ...(raw ? { text: raw } : {}) });
    }
  }
}
const stamp = evidence.date.replace(/[:.]/g, '-');
await mkdir('.data/golden', { recursive: true });
await writeFile(`.data/golden/${stamp}.json`, JSON.stringify(evidence, null, 2) + '\n');
const review = [`# Golden set ${evidence.date}`, '', `Model: ${evidence.model}`, '',
  ...evidence.results.flatMap(result => [`## ${result.parent ? `${PARENTS[result.parent].label}: ` : ''}${result.key}`, '',
    `${result.why}${result.context ? ` · Context: ${result.context}` : ''}${result.inputType ? ` · read as ${result.inputType}` : ''}`, '',
    result.error ? `**Failed:** ${result.error}${result.text ? `\n\n\`\`\`text\n${result.text}\n\`\`\`` : ''}` : `Facets shown: ${result.facets.join(', ') || 'none'}\n\n\`\`\`text\n${result.text}\n\`\`\``, ''])].join('\n');
await writeFile(`.data/golden/${stamp}.md`, review);
const failed = evidence.results.filter(result => result.error).length;
console.log(`Golden set finished: ${evidence.results.length - failed} outputs, ${failed} failures. Review .data/golden/${stamp}.md.`);
