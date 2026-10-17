import { blockText, noteDocument, textBlocks } from '@vocabularium/domain/pages';
import { applyDraft, draftOf, parentContentOf, parentDocument } from '@vocabularium/domain/content';
import { isParentType } from '@vocabularium/domain/parents';
import { dialog } from './dialog.ts';
import { PageView } from './page-view.tsx';
/** @typedef {import('../types/editor-drafts.js').PageEditorDraft} PageEditorDraft */

const RETRY_COMPONENT = 'Retry will replace this component’s content, including your edits to it. The main key, Context, and other components will not change.';
const RETRY_FACET = 'Retry will replace this facet’s content, including your edits to it. The rest of the component will not change.';
const CHANGED = 'This content changed since you looked at it, possibly on another installation. ';
const DRAFT_KEY = 'page-draft-modules';

export function pageViews({ getAccount, renderView, refresh, send, applyState, navigate, showError }) {
  /** @type {PageEditorDraft | undefined} */
  let draft;
  // Drafts from earlier page models are not carried over (Q72, D02).
  for (const retired of ['karte-draft', 'card-draft', 'page-draft']) sessionStorage.removeItem(retired);
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY)) ?? undefined; } catch { /* No recoverable draft. */ }
  let busy = false;
  const persist = () => {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  };
  const identity = hash => hash.split('/').slice(0, 2).join('/');
  const matches = hash => draft && identity(hash) === draft.route;
  const changed = () => draft ? Object.keys(draft.texts).filter(id => draft.texts[id] !== draft.base[id]) : [];
  // Parent cards in the live editor (D09) whose draft differs from the one they opened with.
  const changedFields = () => draft ? Object.keys(draft.fields ?? {}).filter(id => JSON.stringify(draft.fields[id]) !== draft.fieldBase?.[id]) : [];
  const inputs = () => draft ? Object.entries(draft.inputs ?? {}).filter(([, text]) => text.length) : [];
  const dirty = () => Boolean(draft && (changed().length || changedFields().length || inputs().length || (!draft.pageId && draft.mainKey)));
  // Editing is one card at a time (D04): the draft holds that component's
  // text, or for a parent (D09), its core's and facets' markdown; with a
  // facet (D10), only that facet is open.
  function begin(page, route, componentId, facet) {
    const component = page.components.find(item => item.id === componentId);
    if (!component) return;
    draft = { route: identity(route), pageId: page.id, deckId: page.deckId, componentId, base: {}, texts: {} };
    const content = isParentType(component.moduleType) ? parentContentOf(component.content) : null;
    if (content) {
      const fields = draftOf(component.moduleType, content, component.facets ?? []);
      draft.fields = { [componentId]: fields }; draft.fieldBase = { [componentId]: JSON.stringify(fields) }; draft.fieldStored = { [componentId]: content };
      if (facet === 'core') draft.core = true;
      else if (facet && fields.facets[facet] !== undefined) draft.facet = facet;
    } else draft.base[componentId] = draft.texts[componentId] = blockText(component.content);
    persist();
  }
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
  function payload(page) {
    if (!draft.pageId) return { deckId: draft.deckId, mainKey: draft.mainKey ?? '',
      // A new page's Context and Text are typed as plain text and stored as markdown (D10, amended a fourth time).
      initial: inputs().map(([moduleInstanceId, text]) => ({ moduleInstanceId, content: noteDocument(text) })) };
    const fieldChanges = changedFields().map(componentId => {
      const component = page?.components.find(item => item.id === componentId);
      const stored = draft.fieldStored?.[componentId];
      if (!component || !stored) throw Object.assign(new Error('This module no longer exists; its draft can not be saved.'), { code: 'deleted' });
      const content = parentDocument(applyDraft(component.moduleType, stored, draft.fields[componentId], { facets: component.facets ?? [] }));
      // A facet edited on its own (D10): the server takes only that facet, over what it has stored.
      // The core edited on its own (D10, amended) likewise.
      return { componentId, content, ...(draft.facet ? { facet: draft.facet } : draft.core ? { core: true } : {}) };
    });
    return { pageId: draft.pageId, changes: [...changed().map(componentId => ({ componentId, content: textBlocks(draft.texts[componentId]) })), ...fieldChanges] };
  }
  async function save(page) {
    if (busy || !draft) return false;
    const key = page?.components.find(component => component.moduleType === 'main-key');
    const mainKey = draft.pageId ? draft.texts[key?.id] : draft.mainKey;
    if (mainKey !== undefined && !mainKey.trim()) {
      // Shown inside the empty main key field rather than as a notice below it.
      draft.error = undefined; draft.fieldError = 'Main key can not be empty.'; draft.errorCode = 'invalid'; persist(); void refresh(); return false;
    }
    let next;
    try { next = payload(page); }
    catch (error) { draft.error = error.message; draft.errorCode = error.code ?? 'invalid'; persist(); void refresh(); return false; }
    if (draft.pageId && !next.changes.length) { await discard(); void refresh(); return true; }
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
    } catch (error) {
      draft.error = error.message; draft.errorCode = error.code; persist(); return false;
    } finally { busy = false; if (draft) void refresh(); }
  }
  async function leave() {
    if (busy) return false;
    if (!draft) return true;
    if (!dirty()) { await discard(); return true; }
    const result = await dialog({ title: 'Unsaved changes', message: 'Save your changes before leaving, discard them, or continue editing.', choices: ['Continue editing', 'Discard', 'Save'] });
    if (result.choice === 'Continue editing') return false;
    if (result.choice === 'Discard') { await discard(); return true; }
    return save(getAccount().pages?.[0]);
  }
  // Retries replace content. The server reports a digest of the content they
  // replace; the user confirms, and the retry carries that digest back. A
  // component that never generated and is empty has nothing to replace, so
  // the server starts it without asking. The page view asks beside the card's
  // tab before a retry that replaces content (`confirmed`, 0.6.3); the dialog
  // remains for content that changed meanwhile, such as in another browser.
  async function generate(page, target, confirmed = false) {
    const request = confirmation => send({ type: 'generate-page', payload: { pageId: page.id, target, ...(confirmation ? { confirmation } : {}) } });
    try {
      let warning = target.scope === 'facet' ? RETRY_FACET : RETRY_COMPONENT;
      for (let round = 0; round < 3; round++) {
        let confirmation;
        try { await applyState(await request(confirmation)); return; }
        catch (error) {
          if (error.code !== 'confirmation_required') throw error;
          confirmation = error.details?.confirmation;
        }
        if (!(confirmed && round === 0)) {
          const choice = await dialog({ title: target.scope === 'facet' ? 'Retry this facet?' : 'Retry this component?', message: warning, choices: ['Cancel', 'Confirm'] });
          if (choice.choice !== 'Confirm') return;
        }
        try { await applyState(await request(confirmation)); return; }
        catch (error) {
          if (error.code !== 'confirmation_required') throw error;
          warning = CHANGED + (target.scope === 'facet' ? RETRY_FACET : RETRY_COMPONENT);
        }
      }
    } catch (error) { showError(error); }
  }
  // Shaping steps are saved at once, each as one ordered operation. The result
  // says whether the step was saved, so a failed move can restore the order.
  async function shape(type, payload) {
    try { await applyState(await send({ type, payload })); return true; } catch (error) { showError(error); return false; }
  }
  // The page view asks first, beside the card's tab, unless the component is empty (0.6.3).
  async function deleteComponent(page, component) {
    await shape('delete-component', { pageId: page.id, componentId: component.id });
  }
  function render(hash, local, externalError) {
    const [, id] = hash.split('/');
    const isNew = hash.startsWith('#new-page/');
    const account = getAccount();
    const page = isNew ? undefined : account.pages.find(page => page.id === id);
    const deck = account.decks.find(deck => deck.id === (isNew ? id : page?.deckId ?? draft?.deckId));
    if (isNew && deck && !matches(hash)) beginNew(deck.id, hash);
    const editing = Boolean(matches(hash));
    const pendingSaves = Object.entries(local).filter(([key, item]) => key.startsWith('save-') && item?.state !== 'saving').map(([, item]) => item);
    renderView(PageView, {
      page, deck, draft, isNew, editing, busy, error: externalError, navigate, persist, pendingSaves,
      redraw: () => void refresh(),
      retryPendingSave: async operationId => {
        try { const next = await send({ type: 'try-saving-again', operationId }); await applyState(next); }
        catch (error) { showError(error); }
      },
      begin: (componentId, facet) => { begin(page, hash, componentId, facet); void refresh(); },
      save: () => save(page),
      cancel: async () => { await discard(); if (isNew) navigate(`deck/${deck.id}`); else void refresh(); },
      discardUnavailable: async () => { await discard(); navigate(''); },
      deletePage: async () => {
        const decision = await dialog({ title: 'Delete page?', message: 'This page and all its components will be deleted.', choices: ['Cancel', 'Delete page'] });
        if (decision.choice !== 'Delete page') return;
        try { const next = await send({ type: 'delete-page', payload: { pageId: page.id } }); await discard(); await applyState(next); navigate(`deck/${deck.id}`); }
        catch (error) { showError(error); }
      },
      generate: (target, confirmed) => generate(page, target, confirmed),
      addModule: (type, position) => shape('add-module', { pageId: page.id, type, ...(position ? { position } : {}) }),
      moveComponent: (componentId, position) => shape('move-component', { pageId: page.id, componentId, position }),
      deleteComponent: component => deleteComponent(page, component),
      // Facets (D08) join or leave one parent component; an added facet waits for Retry.
      addFacet: (componentId, parent, facet) => shape('add-facet', { pageId: page.id, componentId, parent, facet }),
      deleteFacet: (componentId, parent, facet) => shape('delete-facet', { pageId: page.id, componentId, parent, facet })
    });
  }
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  return { render, leave, dirty, isEditing: () => Boolean(draft), matches, busy: () => busy };
}
