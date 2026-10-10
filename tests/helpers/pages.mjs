import { blockText, textBlocks } from '@vocabularium/domain/pages';
import { isContentType } from '@vocabularium/domain/page-modules';

export { textBlocks };
export const text = component => blockText(component.content);
// Content components: the ones generation produces.
export const generated = page => page.components.filter(component => isContentType(component.moduleType));
export const component = (page, moduleType) => page.components.find(candidate => candidate.moduleType === moduleType);
export const code = expected => error => error.code === expected;

// Replaces the default deck's configuration with the main key module followed by
// instances of these module types, and returns those instances.
export async function useModules(store, types, deckId) {
  const id = deckId ?? (await store.snapshot()).id;
  const deck = await store.deck(id);
  const modules = types.map((type, index) => ({ id: `${id}-m${index}-${type}`, type }));
  const key = deck.modules.find(module => module.type === 'main-key');
  await store.saveDeck(`configure-${id}-${types.join('-')}`, { deck: { id, name: deck.name, modules: [key, ...modules], view: { module: 'default' } } });
  return modules;
}
export async function capture(store, id = 'capture', session, mainKey = '  幸福\n', context) {
  const payload = { session, mainKey, ...(context === undefined ? {} : { context }), snapshot: await store.snapshot() };
  const result = await store.capture(id, payload);
  return { ...result, payload, page: await store.page(result.pageId) };
}
export async function complete(store, page, session, output = component => `generated ${component.moduleInstanceId}`) {
  for (const item of generated(page).filter(item => item.status === 'loading')) {
    await store.stage(item.attemptId, { ok: true, text: output(item) });
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
