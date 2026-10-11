import type { InputInterpretation, InputType } from '@vocabularium/contracts';

export type ModuleType = 'german-explanation' | 'german-examples' | 'sentence-usage';
export type ModuleDefinition = Readonly<{
  label: string;
  applies: InputType;
}>;
export type ModuleInstance = Readonly<{ id: string; type: ModuleType }>;

export const MODULES = Object.freeze({
  'german-explanation': { label: 'German explanation', applies: 'word_phrase' },
  'german-examples': { label: 'German explanation + examples', applies: 'word_phrase' },
  'sentence-usage': { label: 'Sentence usage', applies: 'sentence' }
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

// Generates one content module instance's component from the main key. Returns
// '' when the instance does not apply; throws when it fails.
export async function generateComponent(input: {
  mainKey: string;
  module: ModuleInstance;
  interpretation?: InputInterpretation | null;
  generate: GenerateModule;
  claimOutput?: (type: ModuleType, text: string) => boolean;
}): Promise<string> {
  const { module } = input;
  const definition = MODULES[module.type];
  if (!definition) throw new Error('The deck contains an unsupported module.');
  if (!input.interpretation) throw new Error('Input interpretation is unavailable.');
  if (definition.applies !== input.interpretation.inputType) return '';
  const previous: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await input.generate({ module, selectedText: input.mainKey, interpretation: input.interpretation, avoid: previous });
    if (typeof text !== 'string' || !text.trim()) throw new Error('A module returned no usable content.');
    if (!input.claimOutput || input.claimOutput(module.type, text)) return text;
    previous.push(text);
  }
  throw new Error('Repeated modules did not produce distinct examples.');
}

export type ComponentOutcome = Readonly<
  { moduleInstanceId: string; status: 'completed'; text: string } |
  { moduleInstanceId: string; status: 'failed'; error: string }
>;

// One generation run: instances share the interpretation and run in configured
// order (claimOutput relies on it), but each completes or fails on its own.
export async function generateComponents(input: {
  mainKey: string;
  modules: readonly ModuleInstance[];
  interpretation?: InputInterpretation | null;
  generate: GenerateModule;
  claimOutput?: (type: ModuleType, text: string) => boolean;
}): Promise<ComponentOutcome[]> {
  const outcomes: ComponentOutcome[] = [];
  for (const module of input.modules) {
    try {
      outcomes.push({ moduleInstanceId: module.id, status: 'completed', text: await generateComponent({ ...input, module }) });
    } catch (error) {
      outcomes.push({ moduleInstanceId: module.id, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}
