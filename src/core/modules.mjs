import { MODULES } from '../../extension/modules.js';
export { MODULES };

export function validateInterpretation(value) {
  if (!value || !['word_phrase', 'sentence'].includes(value.inputType) || typeof value.sourceLanguage !== 'string' || !value.sourceLanguage.trim()) {
    throw new Error('The input could not be interpreted.');
  }
  return { inputType: value.inputType, sourceLanguage: value.sourceLanguage };
}

export async function renderPage({ selectedText, modules, interpretation, generate, claimOutput }) {
  const output = [];
  for (const module of modules) {
    const definition = MODULES[module.type];
    if (!definition) throw new Error('The page contains an unsupported module.');
    if (module.type === 'selected') { output.push(selectedText); continue; }
    if (!interpretation) throw new Error('Input interpretation is unavailable.');
    if (definition.applies !== 'any' && definition.applies !== interpretation.inputType) continue;
    if (module.type === 'selected-language') { output.push(`${selectedText}\n${interpretation.sourceLanguage}`); continue; }
    let text;
    const previous = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      text = await generate({ module, selectedText, interpretation, avoid: previous });
      if (typeof text !== 'string' || !text.trim()) throw new Error('A module returned no usable content.');
      if (!claimOutput || claimOutput(module.type, text)) break;
      previous.push(text); text = undefined;
    }
    if (text === undefined) throw new Error('Repeated modules did not produce distinct examples.');
    output.push(text);
  }
  return output.filter(text => text.length > 0).join('\n\n');
}
