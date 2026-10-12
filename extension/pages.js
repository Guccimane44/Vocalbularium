import { blockText, textBlocks } from '@vocabularium/domain/pages';
import { moduleLabel } from './shaping.tsx';
import { dialog } from './dialog.ts';
import { PageView } from './page-view.tsx';
/** @typedef {import('../types/editor-drafts.js').PageEditorDraft} PageEditorDraft */

const RETRY_COMPONENT = 'Retry will replace this component’s content, including your edits to it. The main key, Context, and other components will not change.';
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
  const inputs = () => draft ? Object.entries(draft.inputs ?? {}).filter(([, text]) => text.length) : [];
  const dirty = () => Boolean(draft && (changed().length || inputs().length || (!draft.pageId && draft.mainKey)));
  // Editing is one card at a time (D04): the draft holds that component's text.
  function begin(page, route, componentId) {
    const component = page.components.find(item => item.id === componentId);
    if (!component) return;
    draft = { route: identity(route), pageId: page.id, deckId: page.deckId, componentId, base: {}, texts: {} };
    draft.base[componentId] = draft.texts[componentId] = blockText(component.content);
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
  function payload() {
    if (!draft.pageId) return { deckId: draft.deckId, mainKey: draft.mainKey ?? '',
      initial: inputs().map(([moduleInstanceId, text]) => ({ moduleInstanceId, content: textBlocks(text) })) };
    return { pageId: draft.pageId, changes: changed().map(componentId => ({ componentId, content: textBlocks(draft.texts[componentId]) })) };
  }
  async function save(page) {
    if (busy || !draft) return false;
    const key = page?.components.find(component => component.moduleType === 'main-key');
    const mainKey = draft.pageId ? draft.texts[key?.id] : draft.mainKey;
    if (mainKey !== undefined && !mainKey.trim()) {
      // Shown inside the empty main key field rather than as a notice below it.
      draft.error = undefined; draft.fieldError = 'Main key can not be empty.'; draft.errorCode = 'invalid'; persist(); void refresh(); return false;
    }
    const next = payload();
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
  // the server starts it without asking.
  async function generate(page, target) {
    const request = confirmation => send({ type: 'generate-page', payload: { pageId: page.id, target, ...(confirmation ? { confirmation } : {}) } });
    try {
      let warning = RETRY_COMPONENT;
      for (let round = 0; round < 3; round++) {
        let confirmation;
        try { await applyState(await request(confirmation)); return; }
        catch (error) {
          if (error.code !== 'confirmation_required') throw error;
          confirmation = error.details?.confirmation;
        }
        const choice = await dialog({ title: 'Retry this component?', message: warning, choices: ['Cancel', 'Confirm'] });
        if (choice.choice !== 'Confirm') return;
        try { await applyState(await request(confirmation)); return; }
        catch (error) {
          if (error.code !== 'confirmation_required') throw error;
          warning = CHANGED + RETRY_COMPONENT;
        }
      }
    } catch (error) { showError(error); }
  }
  // Shaping steps are saved at once, each as one ordered operation. The result
  // says whether the step was saved, so a failed move can restore the order.
  async function shape(type, payload) {
    try { await applyState(await send({ type, payload })); return true; } catch (error) { showError(error); return false; }
  }
  async function deleteComponent(page, component) {
    const label = moduleLabel(component.moduleType);
    const decision = await dialog({ title: `Delete ${label}?`,
      message: `${label} and its content will be removed from this page. Generation will not bring it back; you can add the module again from the module window.`,
      choices: ['Cancel', 'Delete'] });
    if (decision.choice === 'Delete') await shape('delete-component', { pageId: page.id, componentId: component.id });
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
      begin: componentId => { begin(page, hash, componentId); void refresh(); },
      save: () => save(page),
      cancel: async () => { await discard(); if (isNew) navigate(`deck/${deck.id}`); else void refresh(); },
      discardUnavailable: async () => { await discard(); navigate(''); },
      deletePage: async () => {
        const decision = await dialog({ title: 'Delete page?', message: 'This page and all its components will be deleted.', choices: ['Cancel', 'Delete page'] });
        if (decision.choice !== 'Delete page') return;
        try { const next = await send({ type: 'delete-page', payload: { pageId: page.id } }); await discard(); await applyState(next); navigate(`deck/${deck.id}`); }
        catch (error) { showError(error); }
      },
      generate: target => generate(page, target),
      addModule: (type, position) => shape('add-module', { pageId: page.id, type, ...(position ? { position } : {}) }),
      moveComponent: (componentId, position) => shape('move-component', { pageId: page.id, componentId, position }),
      deleteComponent: component => deleteComponent(page, component)
    });
  }
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  return { render, leave, dirty, isEditing: () => Boolean(draft), matches, busy: () => busy };
}
