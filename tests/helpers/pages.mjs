// @ts-check
import { blockText, textBlocks } from '@vocabularium/domain/pages';
import { formatContent, formatCore, parentContentOf } from '@vocabularium/domain/content';
import { plainLines } from '@vocabularium/domain/markdown';
import { isContentType } from '@vocabularium/domain/page-modules';
import { facetsOf, isParentType } from '@vocabularium/domain/parents';
/** @import { BrowserSession, Component, DeckConfiguration, Page } from '@vocabularium/contracts' */
/** @import { GeneratedParent } from '@vocabularium/domain/generated' */
/** @import { ParentContent } from '@vocabularium/domain/content' */
/** @import { AccountStore } from '../../src/core/store.mjs' */

export { textBlocks };
// A component's text: its plain text, or for a parent (D09) the plain lines of
// its core's markdown: its meanings or its translation.
/** @param {Component} component */
export const text = component => {
  const data = parentContentOf(component.content);
  return data ? plainLines(data.core).join('\n') : blockText(component.content);
};
// Structured provider results (D09) for controlled providers.
/** @param {string | string[]} meanings @param {Record<string, unknown>} [facets] @param {{ language?: string, key?: string }} [options] */
export const wordResult = (meanings, facets = {}, { language = 'Englisch', key = 'key' } = {}) =>
  ({ core: { kind: /** @type {const} */ ('word'), language, key, meanings: /** @type {string[]} */ ([]).concat(meanings) }, facets });
// A sentence has the same core as a word (D17): its translation is its one meaning.
/** @param {string} translation @param {Record<string, unknown>} [facets] @param {{ language?: string, key?: string }} [options] */
export const sentenceResult = (translation, facets = {}, { language = 'Englisch', key = 'A sentence.' } = {}) =>
  ({ core: { kind: /** @type {const} */ ('sentence'), language, key, meanings: [translation] }, facets });
// What a controlled provider reads the key as, since each module reads it
// itself (D17): a key that ends like a sentence is one.
/** @param {string} key */
export const isSentence = key => /[.!?。！？]\s*$/.test(key.trim());
// The result for the request's key: `value` as the one meaning of a word, or a sentence's translation.
/** @param {{ selectedText: string }} request @param {string} value @param {Record<string, unknown>} [facets] */
export const resultFor = (request, value, facets = {}) =>
  isSentence(request.selectedText) ? sentenceResult(value, facets, { key: request.selectedText }) : wordResult(value, facets, { key: request.selectedText });
// Content components: the ones generation produces.
/** @param {Page} page */
export const generated = page => page.components.filter(component => isContentType(component.moduleType));
/** @param {Page} page @param {string} moduleType */
export const component = (page, moduleType) => page.components.find(candidate => candidate.moduleType === moduleType);
/** @param {string} expected */
export const code = expected => (/** @type {unknown} */ error) => /** @type {{ code?: unknown }} */ (error).code === expected;

// Replaces the default deck's configuration with the main key module followed by
// instances of these module types, and returns those instances.
/** @param {AccountStore} store @param {readonly string[]} types @param {string} [deckId] */
export async function useModules(store, types, deckId) {
  const id = deckId ?? (await store.snapshot()).id;
  const deck = await store.deck(id);
  // A parent comes with all its facets (D08).
  const modules = types.map((type, index) => ({ id: `${id}-m${index}-${type}`, type, ...(isParentType(type) ? { facets: facetsOf(type) } : {}) }));
  // Every deck has its main key.
  const key = /** @type {DeckConfiguration['modules'][number]} */ (deck.modules.find(module => module.type === 'main-key'));
  await store.saveDeck(`configure-${id}-${types.join('-')}`, { deck: { id, name: deck.name, modules: [key, ...modules], view: { module: 'default' } } });
  return modules;
}
/** @param {AccountStore} store @param {string | undefined} id @param {BrowserSession} session @param {string} [mainKey] @param {string} [context] */
export async function capture(store, id = 'capture', session, mainKey = '  幸福\n', context) {
  const payload = { session, mainKey, ...(context === undefined ? {} : { context }), snapshot: await store.snapshot() };
  const result = await store.capture(id, payload);
  return { ...result, payload, page: await store.page(result.pageId) };
}
// An edit of a generated parent component (D09): its stored content with this
// core, as a numbered list of meanings for a word or the text for a sentence.
/** @param {Component} component @param {string[]} meanings */
export function fieldEdit(component, ...meanings) {
  const block = component.content.blocks[0];
  if (block?.type !== 'parent') throw new Error('fieldEdit needs a generated parent component.');
  const core = block.header.kind === 'word' ? formatCore('german', { kind: 'word', meanings }) : meanings.join('\n');
  return { version: 1, blocks: [{ ...block, core }] };
}
// A staged result (D09): the provider's JSON formatted into markdown as the
// worker does; a string stands for a word with that one meaning ('' for none).
/** @param {string | ParentContent | GeneratedParent} value */
export const staged = value => ({ ok: true, content: /** @type {Partial<ParentContent> | undefined} */ (value)?.header ? value
  : formatContent('german', typeof value === 'string' ? wordResult(value ? [value] : []) : /** @type {GeneratedParent} */ (value)) });
/** @param {AccountStore} store @param {Page} page @param {BrowserSession} session @param {(component: Component) => string | ParentContent | GeneratedParent} [output] */
export async function complete(store, page, session, output = component => `generated ${component.moduleInstanceId}`) {
  for (const item of generated(page).filter(item => item.status === 'loading')) {
    // A loading component has its attempt.
    const attemptId = /** @type {string} */ (item.attemptId);
    await store.stage(attemptId, staged(output(item)));
    await store.publish(`publish-${item.attemptId}`, { attemptId, session });
  }
}
// Retries ask for confirmation first; this confirms what the store reports.
/** @param {AccountStore} store @param {string} id @param {Parameters<AccountStore['generate']>[1]} payload @param {Parameters<AccountStore['generate']>[2]} [options] */
export async function confirmed(store, id, payload, options) {
  try { return await store.generate(id, payload, options); }
  catch (caught) {
    const error = /** @type {import('../../src/core/store.mjs').StoreError} */ (caught);
    if (error.code !== 'confirmation_required') throw error;
    return store.generate(id, { ...payload, confirmation: /** @type {{ confirmation: string }} */ (error.details).confirmation }, options);
  }
}
