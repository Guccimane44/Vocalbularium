import { mkdir, writeFile } from 'node:fs/promises';
import { OpenAIProvider } from '../src/server/openai.mjs';
import { renderPage } from '../src/core/modules.mjs';

if (!process.env.OPENAI_API_KEY) throw new Error('Configure OPENAI_API_KEY in the ignored .env file first.');
const provider = new OpenAIProvider();
const evidence = { date: new Date().toISOString(), model: provider.model, captures: [] };
for (const selectedText of ['幸福', '我真的很幸福']) {
  const interpretation = await provider.interpret(selectedText);
  const outputs = [];
  for (const [index, type] of ['selected', 'selected-language', 'german-explanation', 'german-examples', 'sentence-usage', 'sentence-usage'].entries()) {
    const seen = new Set(outputs.filter(output => output.type === type).map(output => output.text));
    const text = await renderPage({ selectedText, interpretation, modules: [{ id: `smoke-${index}`, type }], generate: input => provider.generate(input),
      claimOutput: (_, output) => { if (seen.has(output)) return false; seen.add(output); return true; } });
    outputs.push({ type, text });
  }
  evidence.captures.push({ selectedText, interpretation, outputs });
}
await mkdir('.data', { recursive: true });
await writeFile('.data/live-smoke.json', JSON.stringify(evidence, null, 2) + '\n');
console.log('Live provider requests completed. Review .data/live-smoke.json for language, format, and example consistency before recording acceptance.');
