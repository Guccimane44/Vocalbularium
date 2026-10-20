import { blockText, textBlocks } from '@vocabularium/domain/pages';
import { formatContent, formatCore, parentContentOf } from '@vocabularium/domain/content';
import { plainLines } from '@vocabularium/domain/markdown';
import { isContentType } from '@vocabularium/domain/page-modules';
import { facetsOf, isParentType } from '@vocabularium/domain/parents';

export { textBlocks };
// A component's text: its plain text, or for a parent (D09) the plain lines of
// its core's markdown: its meanings or its translation.
export const text = component => {
  const data = parentContentOf(component.content);
  return data ? plainLines(data.core).join('\n') : blockText(component.content);
};
// Structured provider results (D09) for controlled providers.
export const wordResult = (meanings, facets = {}, { language = 'Englisch', key = 'key' } = {}) =>
  ({ core: { kind: 'word', language, key, meanings: [].concat(meanings) }, facets });
export const sentenceResult = (translation, facets = {}) => ({ core: { kind: 'sentence', translation }, facets });
// The result for the request's input type: `value` as the one meaning of a word, or a sentence's translation.
export const resultFor = (request, value, facets = {}) =>
  request.interpretation.inputType === 'sentence' ? sentenceResult(value, facets) : wordResult(value, facets, { key: request.selectedText });
// Content components: the ones generation produces.
export const generated = page => page.components.filter(component => isContentType(component.moduleType));
export const component = (page, moduleType) => page.components.find(candidate => candidate.moduleType === moduleType);
export const code = expected => error => error.code === expected;

// Replaces the default deck's configuration with the main key module followed by
// instances of these module types, and returns those instances.
export async function useModules(store, types, deckId) {
  const id = deckId ?? (await store.snapshot()).id;
  const deck = await store.deck(id);
  // A parent comes with all its facets (D08).
  const modules = types.map((type, index) => ({ id: `${id}-m${index}-${type}`, type, ...(isParentType(type) ? { facets: facetsOf(type) } : {}) }));
  const key = deck.modules.find(module => module.type === 'main-key');
  await store.saveDeck(`configure-${id}-${types.join('-')}`, { deck: { id, name: deck.name, modules: [key, ...modules], view: { module: 'default' } } });
  return modules;
}
export async function capture(store, id = 'capture', session, mainKey = '  幸福\n', context) {
  const payload = { session, mainKey, ...(context === undefined ? {} : { context }), snapshot: await store.snapshot() };
  const result = await store.capture(id, payload);
  return { ...result, payload, page: await store.page(result.pageId) };
}
// An edit of a generated parent component (D09): its stored content with this
// core, as a numbered list of meanings for a word or the text for a sentence.
export function fieldEdit(component, ...meanings) {
  const block = component.content.blocks[0];
  if (block?.type !== 'parent') throw new Error('fieldEdit needs a generated parent component.');
  const core = block.header.kind === 'word' ? formatCore('german', { kind: 'word', meanings }) : meanings.join('\n');
  return { version: 1, blocks: [{ ...block, core }] };
}
// A staged result (D09): the provider's JSON formatted into markdown as the
// worker does; a string stands for a word with that one meaning ('' for none).
export const staged = value => ({ ok: true, content: value?.header ? value : formatContent('german', typeof value === 'string' ? wordResult(value ? [value] : []) : value) });
export async function complete(store, page, session, output = component => `generated ${component.moduleInstanceId}`) {
  for (const item of generated(page).filter(item => item.status === 'loading')) {
    await store.stage(item.attemptId, staged(output(item)));
    await store.publish(`publish-${item.attemptId}`, { attemptId: item.attemptId, session });
  }
}
// Retries ask for confirmation first; this confirms what the store reports.
export async function confirmed(store, id, payload, options) {
  try { return await store.generate(id, payload, options); }
  catch (error) {
    if (error.code !== 'confirmation_required') throw error;
    return store.generate(id, { ...payload, confirmation: error.details.confirmation }, options);
  }
}
