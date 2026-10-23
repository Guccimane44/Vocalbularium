import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { InputInterpretation, InputType, InterfaceLanguage } from '@vocabularium/contracts';
import type { CoreValue } from '../catalog/define.js';
import { contentModule, folderOf } from '../catalog/index.js';
import { interpretationSchema } from '../catalog/main-key/module.js';
import { schemaOf } from '../catalog/shape.js';
import type { JsonSchema } from '../catalog/shape.js';
import type { FacetType, ParentType } from '../parents.js';

// The prompt composer (D11): builds a provider-neutral request from a module's
// prompt files in the catalog. A facet's prompt is a fragment; the composer
// joins the core's and the facets' fragments into one request per module and
// adds the rules every request carries (rules.md), which no facet repeats.
// Server-only: it reads the prompt files that ship beside the compiled catalog.

export type Request = Readonly<{
  name: string;
  instructions: string;
  input: Readonly<Record<string, unknown>>;
  schema: JsonSchema;
  maxTokens: number;
}>;

// Room for a module's core and every facet (0.7.0 golden set: 4096 cut some
// off). It stays until real token counts show a smaller budget is safe.
const MAX_TOKENS = 8192;
const FILE: Readonly<Record<InputType, string>> = { word_phrase: 'word', sentence: 'sentence' };

const texts = new Map<string, string>();
// A prompt file's text, without its final line break.
function read(path: string): string {
  const cached = texts.get(path);
  if (cached !== undefined) return cached;
  const text = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\n$/, '');
  texts.set(path, text);
  return text;
}
const catalogFile = (path: string) => read(`../catalog/${path}`);
export const facetPrompt = (parent: ParentType, facet: FacetType | 'core', inputType: InputType) =>
  catalogFile(`${folderOf(parent)}/facets/${facet}/${FILE[inputType]}.prompt.md`);

// The language a module writes in when its prompts name {{language}}: the
// account's interface language (D14, K36). The Expertise modules do; the
// Languages modules write in their own language and name none.
const LANGUAGE_NAMES: Readonly<Record<InterfaceLanguage, string>> = {
  en: 'English', ar: 'Arabic', 'zh-Hans': 'Simplified Chinese', fr: 'French', ru: 'Russian', es: 'Spanish'
};

// The instructions for a module: its core (or, for a facet's own Retry, the
// core already written), its facets asked for, then the shared rules.
export function moduleInstructions(parent: ParentType, inputType: InputType, facets: readonly FacetType[], withCore = false, language: InterfaceLanguage = 'en'): string {
  const folder = folderOf(parent);
  const core = withCore ? catalogFile(`${folder}/facets/core/retry.prompt.md`) : facetPrompt(parent, 'core', inputType);
  const sections = facets.map(facet => `- ${facetPrompt(parent, facet, inputType)}`);
  return [core,
    sections.length ? `In "facets", write only these keys, each left out when it does not apply:\n${sections.join('\n')}` : 'Write "facets" as an empty object.',
    read('./rules.md').replace('{{module}}', catalogFile(`${folder}/module.prompt.md`))].join('\n').replaceAll('{{language}}', LANGUAGE_NAMES[language] ?? 'English');
}

// The JSON schema of the result: the core (unless a facet's own Retry supplies
// it) and the facets asked for, each optional.
export function moduleSchema(parent: ParentType, inputType: InputType, facets: readonly FacetType[], withCore = false): JsonSchema {
  const module = contentModule(parent);
  const facetSchema = schemaOf(Object.fromEntries(facets.map(facet => [facet, module.facets.find(each => each.id === facet)!.shape.schema])), []);
  return withCore ? schemaOf({ facets: facetSchema }) : schemaOf({ core: module.core.shapes[inputType].schema, facets: facetSchema });
}

// One generation attempt for a module instance: its core and the facets that
// apply, or with `core`, a facet's own Retry written for that core.
export function composeModule({ module, selectedText, context, interpretation, facets, core, language }: {
  module: Readonly<{ id: string; type: string }>;
  selectedText: string;
  context?: string;
  interpretation: InputInterpretation;
  facets: readonly FacetType[];
  core?: CoreValue;
  // The account's interface language, which the Expertise modules write in.
  language?: InterfaceLanguage;
}): Request {
  const parent = module.type as ParentType;
  return {
    name: 'vocabulary_parent_module',
    instructions: moduleInstructions(parent, interpretation.inputType, facets, Boolean(core), language),
    input: { selectedText, ...(context ? { context } : {}), ...(core ? { core } : {}), inputType: interpretation.inputType, instanceId: module.id },
    schema: moduleSchema(parent, interpretation.inputType, facets, Boolean(core)),
    maxTokens: MAX_TOKENS
  };
}

// The run's reading of the main key. The optional Context is the selection's
// surrounding text: an aid for disambiguation, never content to explain.
export const interpretationInstructions = () => catalogFile('main-key/interpretation.prompt.md');
export function composeInterpretation(selectedText: string, context?: string): Request {
  return {
    name: 'vocabulary_interpretation', instructions: interpretationInstructions(),
    input: { selectedText, ...(context ? { context } : {}) },
    schema: interpretationSchema, maxTokens: MAX_TOKENS
  };
}

// The prompt version (D11): a fingerprint of a request's instructions and
// schema, so it changes whenever a prompt file, the rules or a shape does, and
// never with the selection.
export function promptVersion(request: Pick<Request, 'instructions' | 'schema'>): string {
  return createHash('sha256').update(`${request.instructions}\n${JSON.stringify(request.schema)}`).digest('hex').slice(0, 16);
}
