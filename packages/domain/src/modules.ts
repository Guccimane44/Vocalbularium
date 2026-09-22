import type { InputInterpretation, InputType } from '@vocabularium/contracts';

export type ModuleType = 'selected' | 'selected-language' | 'german-explanation' | 'german-examples' | 'sentence-usage';
export type ModuleDefinition = Readonly<{
  label: string;
  applies: 'any' | InputType;
  interpretation: boolean;
}>;
export type ModuleInstance = Readonly<{ id: string; type: ModuleType }>;

export const MODULES = Object.freeze({
  selected: { label: '<The selected>', applies: 'any', interpretation: false },
  'selected-language': { label: '<The selected + original language tag>', applies: 'any', interpretation: true },
  'german-explanation': { label: '<German explanation>', applies: 'word_phrase', interpretation: true },
  'german-examples': { label: '<German explanation + examples>', applies: 'word_phrase', interpretation: true },
  'sentence-usage': { label: '<Sentence usage>', applies: 'sentence', interpretation: true }
} satisfies Readonly<Record<ModuleType, ModuleDefinition>>);

export function validateInterpretation(value: unknown): InputInterpretation {
  if (typeof value !== 'object' || value === null ||
    !('inputType' in value) || !('sourceLanguage' in value) ||
    (value.inputType !== 'word_phrase' && value.inputType !== 'sentence') ||
    typeof value.sourceLanguage !== 'string' || !value.sourceLanguage.trim()) {
    throw new Error('The input could not be interpreted.');
  }
  return { inputType: value.inputType, sourceLanguage: value.sourceLanguage };
}

export type GenerateModule = (request: {
  module: ModuleInstance;
  selectedText: string;
  interpretation: InputInterpretation;
  avoid: readonly string[];
}) => Promise<string>;

export async function renderPage(input: {
  selectedText: string;
  modules: readonly ModuleInstance[];
  interpretation?: InputInterpretation | null;
  generate: GenerateModule;
  claimOutput?: (type: ModuleType, text: string) => boolean;
}): Promise<string> {
  const output: string[] = [];
  for (const module of input.modules) {
    const definition = MODULES[module.type];
    if (!definition) throw new Error('The page contains an unsupported module.');
    if (module.type === 'selected') { output.push(input.selectedText); continue; }
    if (!input.interpretation) throw new Error('Input interpretation is unavailable.');
    if (definition.applies !== 'any' && definition.applies !== input.interpretation.inputType) continue;
    if (module.type === 'selected-language') {
      output.push(`${input.selectedText}\n${input.interpretation.sourceLanguage}`);
      continue;
    }
    let text: string | undefined;
    const previous: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      text = await input.generate({ module, selectedText: input.selectedText, interpretation: input.interpretation, avoid: previous });
      if (typeof text !== 'string' || !text.trim()) throw new Error('A module returned no usable content.');
      if (!input.claimOutput || input.claimOutput(module.type, text)) break;
      previous.push(text); text = undefined;
    }
    if (text === undefined) throw new Error('Repeated modules did not produce distinct examples.');
    output.push(text);
  }
  return output.filter(text => text.length > 0).join('\n\n');
}
