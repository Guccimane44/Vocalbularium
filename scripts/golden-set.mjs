// Runs the content modules' golden sets (D08, D11, C8) against the live
// provider and writes the outputs for the owner's review. Each file in
// tests/golden names the modules its inputs run through. It calls OpenCodeProvider
// directly, without the API, database or extension, and spends provider usage.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { generateComponent } from '@vocabularium/domain/modules';
import { facetsOf, PARENTS } from '@vocabularium/domain/parents';
import { filledFacets } from '@vocabularium/domain/content';

if (!process.env.OPENCODE_API_KEY) throw new Error('Configure OPENCODE_API_KEY in the ignored .env file first.');
const only = process.argv[2];
const directory = new URL('../tests/golden/', import.meta.url);
const sets = [];
for (const file of (await readdir(directory)).filter(name => name.endsWith('.json')).sort()) {
  const { modules, inputs } = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
  const types = modules.filter(type => !only || type === only);
  if (types.length) sets.push({ types, inputs });
}
const provider = new OpenCodeProvider();
// A transient service error (such as a rate limit) is tried once more after a
// pause, so the review shows the prompt's results rather than the service's.
async function steady(call) {
  try { return await call(); }
  catch (error) {
    if (error.code !== 'provider_response') throw error;
    await new Promise(resolve => setTimeout(resolve, 10000));
    return call();
  }
}
const evidence = { date: new Date().toISOString(), provider: 'OpenCode Go', model: provider.model, results: [] };
for (const { types, inputs } of sets) for (const input of inputs) {
  const sessionId = randomUUID();
  let interpretation;
  try { interpretation = await steady(() => provider.interpret(input.key, undefined, sessionId, input.context)); }
  catch (error) { evidence.results.push({ ...input, error: `interpretation: ${error.message}` }); continue; }
  for (const type of types) {
    const module = { id: `golden-${type}`, type, facets: facetsOf(type) };
    // Kept so a failed output can be read in the review, not only its error.
    let raw = null;
    try {
      // The model's JSON (D09), and the markdown per facet it is stored as.
      const content = await generateComponent({ mainKey: input.key, interpretation, module,
        generate: async request => (raw = await steady(() => provider.generate({ ...request, context: input.context, sessionId }))) });
      evidence.results.push({ ...input, parent: type, inputType: interpretation.inputType, json: raw, content, facets: filledFacets(type, content) });
    } catch (error) {
      evidence.results.push({ ...input, parent: type, inputType: interpretation.inputType, error: error.message, ...(raw ? { content: raw } : {}) });
    }
  }
}
const json = value => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
// The stored markdown, the core then each facet under its label, as the card shows it.
const markdown = content => ['```markdown', content.core, ...Object.entries(content.facets).flatMap(([facet, text]) => ['', `## ${facet}`, text]), '```'].join('\n');
const stamp = evidence.date.replace(/[:.]/g, '-');
await mkdir('.data/golden', { recursive: true });
await writeFile(`.data/golden/${stamp}.json`, JSON.stringify(evidence, null, 2) + '\n');
const review = [`# Golden set ${evidence.date}`, '', `Model: ${evidence.model}`, '',
  ...evidence.results.flatMap(result => [`## ${result.parent ? `${PARENTS[result.parent].label}: ` : ''}${result.key}`, '',
    `${result.why}${result.context ? ` · Context: ${result.context}` : ''}${result.inputType ? ` · read as ${result.inputType}` : ''}`, '',
    result.error ? `**Failed:** ${result.error}${result.content ? `\n\n${json(result.content)}` : ''}` : `Facets shown: ${result.facets.join(', ') || 'none'}\n\n${markdown(result.content)}\n\n${json(result.json)}`, ''])].join('\n');
await writeFile(`.data/golden/${stamp}.md`, review);
const failed = evidence.results.filter(result => result.error).length;
console.log(`Golden set finished: ${evidence.results.length - failed} outputs, ${failed} failures. Review .data/golden/${stamp}.md.`);
