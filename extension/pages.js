// @ts-check
import { blockText, mainKeyOf, noteDocument, textBlocks } from '@vocabularium/domain/pages';
import { applyDraft, blankContent, draftOf, parentContentOf, parentDocument } from '@vocabularium/domain/content';
import { isParentType } from '@vocabularium/domain/parents';
import { dialog } from './dialog.ts';
import { PageView } from './page-view.tsx';
import { t } from './i18n.ts';
/** @typedef {import('../types/editor-drafts.js').PageEditorDraft} PageEditorDraft */
/** @import { ReactNode } from 'react' */
/** @import { Component, GenerationTarget, Page } from '@vocabularium/contracts' */
/** @import { ParentContent } from '@vocabularium/domain/content' */
/** @import { ParentType } from '@vocabularium/domain/parents' */
/** @import { AccessState, DeckDetail, LocalItems, RuntimeMessage, ViewAccount } from '../types/extension.js' */

const DRAFT_KEY = 'page-draft-modules';

/**
 * @param {{
 *   getAccount: () => ViewAccount,
 *   renderView: <P extends object>(component: (props: P) => ReactNode, props: P) => void,
 *   refresh: () => Promise<void>,
 *   send: (message: RuntimeMessage) => Promise<any>,
 *   applyState: (next: AccessState, redraw?: boolean) => Promise<void>,
 *   navigate: (hash: string) => void,
 *   showError: (error: any) => void
 * }} options
 */
export function pageViews({ getAccount, renderView, refresh, send, applyState, navigate, showError }) {
  /** @type {PageEditorDraft | undefined} */
  let draft;
  // Drafts from earlier page models are not carried over (Q72, D02).
  for (const retired of ['karte-draft', 'card-draft', 'page-draft']) sessionStorage.removeItem(retired);
  // No stored draft parses as null.
  try { draft = JSON.parse(/** @type {string} */ (sessionStorage.getItem(DRAFT_KEY))) ?? undefined; } catch { /* No recoverable draft. */ }
  let busy = false;
  // The page being deleted. Its route is not redrawn meanwhile: the worker's
  // save records redraw the view, and the page would show as unavailable.
  /** @type {string | undefined} */
  let deleting;
  const persist = () => {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  };
  const identity = (/** @type {string} */ hash) => hash.split('/').slice(0, 2).join('/');
  const matches = (/** @type {string} */ hash) => draft && identity(hash) === draft.route;
  // The callbacks below read the draft their guard found; the checker does not carry the guard into them.
  const changed = () => draft ? Object.keys(draft.texts).filter(id => /** @type {PageEditorDraft} */ (draft).texts[id] !== /** @type {PageEditorDraft} */ (draft).base[id]) : [];
  // Parent cards in the live editor (D09) whose draft differs from the one they opened with.
  const changedFields = () => draft ? Object.keys(draft.fields ?? {}).filter(id => JSON.stringify(/** @type {NonNullable<PageEditorDraft['fields']>} */ (/** @type {PageEditorDraft} */ (draft).fields)[id]) !== /** @type {PageEditorDraft} */ (draft).fieldBase?.[id]) : [];
  const inputs = () => draft ? Object.entries(draft.inputs ?? {}).filter(([, text]) => text.length) : [];
  const dirty = () => Boolean(draft && (changed().length || changedFields().length || inputs().length || (!draft.pageId && draft.mainKey)));
  // Editing is one card at a time (D04): the draft holds that component's
  // text, or for a parent (D09), its core's and facets' markdown; with a
  // facet (D10), only that facet is open.
  /** @param {Page} page @param {string} route @param {string} componentId @param {string} [facet] */
  function begin(page, route, componentId, facet) {
    const component = page.components.find(item => item.id === componentId);
    if (!component) return;
    draft = { route: identity(route), pageId: page.id, deckId: page.deckId, componentId, base: {}, texts: {} };
    // An empty parent opens with a blank top line of the main key (D10, amended a fourth time).
    const content = isParentType(component.moduleType) ? parentContentOf(component.content) ?? blankContent(mainKeyOf(page.components), /** @type {ParentType} */ (component.moduleType)) : null;
    if (content) {
      const fields = draftOf(/** @type {ParentType} */ (component.moduleType), content, component.facets ?? []);
      draft.fields = { [componentId]: fields }; draft.fieldBase = { [componentId]: JSON.stringify(fields) }; draft.fieldStored = { [componentId]: content };
      if (facet && fields.facets[facet] !== undefined) draft.facet = facet;
    } else draft.base[componentId] = draft.texts[componentId] = blockText(component.content);
    persist();
  }
  /** @param {string} deckId @param {string} route */
  function beginNew(deckId, route) {
    draft = { route: identity(route), deckId, base: {}, texts: {}, mainKey: '', inputs: {} };
    persist();
  }
  async function discard() {
    if (draft?.pending) await chrome.storage.local.remove(`save-${draft.pending.operationId}`);
    draft = undefined; persist();
  }
  // Context and Text values for a new page are keyed by the deck instance they fill.
  // A parent's draft is saved as its markdown with the top line it opened with (D09).
  // Called with a draft open.
  /** @param {Page | undefined} page */
  function payload(page) {
    if (!/** @type {PageEditorDraft} */ (draft).pageId) return { deckId: /** @type {PageEditorDraft} */ (draft).deckId, mainKey: /** @type {PageEditorDraft} */ (draft).mainKey ?? '',
      // A new page's Context and Text are typed as plain text and stored as markdown (D10, amended a fourth time).
      initial: inputs().map(([moduleInstanceId, text]) => ({ moduleInstanceId, content: noteDocument(text) })) };
    const fieldChanges = changedFields().map(componentId => {
      const component = page?.components.find(item => item.id === componentId);
      const stored = /** @type {ParentContent | undefined} */ (/** @type {PageEditorDraft} */ (draft).fieldStored?.[componentId]);
      if (!component || !stored) throw Object.assign(new Error(t('page.draft.moduleGone')), { code: 'deleted' });
      const content = parentDocument(applyDraft(/** @type {ParentType} */ (component.moduleType), stored, /** @type {NonNullable<PageEditorDraft['fields']>} */ (/** @type {PageEditorDraft} */ (draft).fields)[componentId], { facets: component.facets ?? [] }));
      // A facet edited on its own (D10): the server takes only that facet, over what it has stored.
      return { componentId, content, ...(/** @type {PageEditorDraft} */ (draft).facet ? { facet: /** @type {PageEditorDraft} */ (draft).facet } : {}) };
    });
    return { pageId: /** @type {PageEditorDraft} */ (draft).pageId, changes: [...changed().map(componentId => ({ componentId, content: textBlocks(/** @type {PageEditorDraft} */ (draft).texts[componentId]) })), ...fieldChanges] };
  }
  /** @param {Page | undefined} page */
  async function save(page) {
    if (busy || !draft) return false;
    const key = page?.components.find(component => component.moduleType === 'main-key');
    // A saved page always has its main key.
    const mainKey = draft.pageId ? draft.texts[/** @type {string} */ (key?.id)] : draft.mainKey;
    if (mainKey !== undefined && !mainKey.trim()) {
      // Shown inside the empty main key field rather than as a notice below it.
      draft.error = undefined; draft.fieldError = t('page.draft.mainKeyEmpty'); draft.errorCode = 'invalid'; persist(); void refresh(); return false;
    }
    let next;
    try { next = payload(page); }
    catch (/** @type {any} */ error) { draft.error = error.message; draft.errorCode = error.code ?? 'invalid'; persist(); void refresh(); return false; }
    // A draft of a saved page makes a list of changes.
    if (draft.pageId && !/** @type {{ changes: unknown[] }} */ (next).changes.length) { await discard(); void refresh(); return true; }
    if (draft.pending && JSON.stringify(next) !== JSON.stringify(draft.pending.payload)) {
      await chrome.storage.local.remove(`save-${draft.pending.operationId}`); draft.pending = undefined;
    }
    draft.pending ??= { operationId: crypto.randomUUID(), type: draft.pageId ? 'save-page' : 'create-page', payload: next };
    busy = true; draft.error = undefined; draft.fieldError = undefined; persist(); void refresh();
    try {
      const state = await send(draft.pending);
      const wasNew = !draft.pageId;
      const pageId = state.saved?.pageId ?? draft.pageId;
      draft = undefined; persist(); await applyState(state, false);
      if (wasNew) navigate(`page/${pageId}`); else void refresh();
      return true;
    } catch (/** @type {any} */ error) {
      // The draft is cleared only once the save succeeded.
      /** @type {PageEditorDraft} */ (draft).error = error.message; /** @type {PageEditorDraft} */ (draft).errorCode = error.code; persist(); return false;
    } finally { busy = false; if (draft) void refresh(); }
  }
  async function leave() {
    if (busy) return false;
    if (!draft) return true;
    if (!dirty()) { await discard(); return true; }
    const [stay, drop] = [t('page.leave.continue'), t('page.leave.discard')];
    const result = await dialog({ title: t('page.leave.title'), message: t('page.leave.message'), choices: [stay, drop, t('common.save')] });
    if (result.choice === stay) return false;
    if (result.choice === drop) { await discard(); return true; }
    return save(getAccount().pages?.[0]);
  }
  // Retries replace content. The server reports a digest of the content they
  // replace; the user confirms, and the retry carries that digest back. A
  // component that never generated and is empty has nothing to replace, so
  // the server starts it without asking. The page view asks beside the card's
  // tab before a retry that replaces content (`confirmed`, 0.6.3); the dialog
  // remains for content that changed meanwhile, such as in another browser.
  /** @param {Page} page @param {GenerationTarget} target */
  async function generate(page, target, confirmed = false) {
    const request = (/** @type {string | undefined} */ confirmation) => send({ type: 'generate-page', payload: { pageId: page.id, target, ...(confirmation ? { confirmation } : {}) } });
    try {
      const replaces = target.scope === 'facet' ? t('page.retry.facet') : t('page.retry.component');
      let warning = replaces;
      for (let round = 0; round < 3; round++) {
        let confirmation;
        try { await applyState(await request(confirmation)); return; }
        catch (/** @type {any} */ error) {
          if (error.code !== 'confirmation_required') throw error;
          confirmation = error.details?.confirmation;
        }
        if (!(confirmed && round === 0)) {
          const choice = await dialog({ title: target.scope === 'facet' ? t('page.retry.facetTitle') : t('page.retry.componentTitle'), message: warning, choices: [t('common.cancel'), t('common.confirm')] });
          if (choice.choice !== t('common.confirm')) return;
        }
        try { await applyState(await request(confirmation)); return; }
        catch (/** @type {any} */ error) {
          if (error.code !== 'confirmation_required') throw error;
          warning = t('page.retry.changed', { warning: replaces });
        }
      }
    } catch (error) { showError(error); }
  }
  // Shaping steps are saved at once, each as one ordered operation. The result
  // says whether the step was saved, so a failed move can restore the order.
  /** @param {string} type @param {Record<string, unknown>} payload */
  async function shape(type, payload) {
    try { await applyState(await send({ type, payload })); return true; } catch (error) { showError(error); return false; }
  }
  // The page view asks first, beside the card's tab, unless the component is empty (0.6.3).
  /** @param {Page} page @param {Component} component */
  async function deleteComponent(page, component) {
    await shape('delete-component', { pageId: page.id, componentId: component.id });
  }
  /** @param {string} hash @param {LocalItems} local @param {string} [externalError] */
  function render(hash, local, externalError) {
    const [, id] = hash.split('/');
    const isNew = hash.startsWith('#new-page/');
    const account = getAccount();
    // app.js puts the open page in the account before it renders a page route.
    const page = isNew ? undefined : /** @type {Page[]} */ (account.pages).find(page => page.id === id);
    // On a page route, app.js has put the deck's configuration in the account.
    const deck = /** @type {DeckDetail | undefined} */ (account.decks.find(deck => deck.id === (isNew ? id : page?.deckId ?? draft?.deckId)));
    if (isNew && deck && !matches(hash)) beginNew(deck.id, hash);
    const editing = Boolean(matches(hash));
    const pendingSaves = /** @type {[string, { operationId: string, state?: string }][]} */ (Object.entries(local)).filter(([key, item]) => key.startsWith('save-') && item?.state !== 'saving').map(([, item]) => item);
    // The page's own actions are offered only while it is shown, and the deck's
    // once it is known.
    renderView(PageView, {
      page, deck, draft, isNew, editing, busy, error: externalError, navigate, persist, pendingSaves,
      redraw: () => void refresh(),
      retryPendingSave: async operationId => {
        try { const next = await send({ type: 'try-saving-again', operationId }); await applyState(next); }
        catch (error) { showError(error); }
      },
      begin: (componentId, facet) => { begin(/** @type {Page} */ (page), hash, componentId, facet); void refresh(); },
      save: () => save(page),
      cancel: async () => { await discard(); if (isNew) navigate(`deck/${/** @type {DeckDetail} */ (deck).id}`); else void refresh(); },
      discardUnavailable: async () => { await discard(); navigate(''); },
      deletePage: async () => {
        const decision = await dialog({ title: t('page.delete.title'), message: t('page.delete.message'), choices: [t('common.cancel'), t('page.delete')] });
        if (decision.choice !== t('page.delete')) return;
        deleting = /** @type {Page} */ (page).id;
        try { const next = await send({ type: 'delete-page', payload: { pageId: deleting } }); await discard(); await applyState(next, false); deleting = undefined; navigate(`deck/${/** @type {DeckDetail} */ (deck).id}`); }
        catch (error) { deleting = undefined; showError(error); }
      },
      generate: (target, confirmed) => generate(/** @type {Page} */ (page), target, confirmed),
      addModule: (type, position) => shape('add-module', { pageId: /** @type {Page} */ (page).id, type, ...(position ? { position } : {}) }),
      moveComponent: (componentId, position) => shape('move-component', { pageId: /** @type {Page} */ (page).id, componentId, position }),
      deleteComponent: component => deleteComponent(/** @type {Page} */ (page), component),
      // Facets (D08) join or leave one parent component; an added facet waits for Retry.
      addFacet: (componentId, parent, facet) => shape('add-facet', { pageId: /** @type {Page} */ (page).id, componentId, parent, facet }),
      deleteFacet: (componentId, parent, facet) => shape('delete-facet', { pageId: /** @type {Page} */ (page).id, componentId, parent, facet })
    });
  }
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  return { render, leave, dirty, isEditing: () => Boolean(draft), matches, busy: () => busy, deleting: (/** @type {string} */ pageId) => pageId === deleting };
}
