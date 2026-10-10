import { blockText, textBlocks } from '@vocabularium/domain/pages';
import { dialog } from './dialog.ts';
import { PageView } from './page-view.tsx';
/** @typedef {import('../types/editor-drafts.js').PageEditorDraft} PageEditorDraft */

const RETRY_COMPONENT = 'Retry will replace this component’s content, including your edits to it. The main key, Context, and other components will not change.';
const RETRY_PAGE = 'Retry will replace the content of every generated component on this page, including your edits to them. The main key, Context, and your own components will not change.';
const CHANGED = 'This content changed since you looked at it, possibly on another installation. ';
const DRAFT_KEY = 'page-draft';

export function pageViews({ getAccount, renderView, refresh, send, applyState, navigate, showError }) {
  /** @type {PageEditorDraft | undefined} */
  let draft;
  // Drafts from the karte/seite version are not carried over (Q72).
  sessionStorage.removeItem('karte-draft'); sessionStorage.removeItem('card-draft');
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY)) ?? undefined; } catch { /* No recoverable draft. */ }
  let busy = false;
  const persist = () => {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  };
  const identity = hash => hash.split('/').slice(0, 2).join('/');
  const matches = hash => draft && identity(hash) === draft.route;
  const changed = () => draft ? Object.keys(draft.texts).filter(id => draft.texts[id] !== draft.base[id]) : [];
  const added = () => draft ? draft.added.filter(text => text.length) : [];
  const dirty = () => Boolean(draft && (changed().length || added().length || draft.context || (!draft.pageId && draft.mainKey)));
  function begin(page, route) {
    draft = { route: identity(route), pageId: page.id, deckId: page.deckId, base: {}, texts: {}, added: [] };
    for (const component of page.components) {
      draft.base[component.id] = draft.texts[component.id] = blockText(component.content);
    }
    persist();
  }
  function beginNew(deckId, route) {
    draft = { route: identity(route), deckId, base: {}, texts: {}, mainKey: '', context: '', added: [] };
    persist();
  }
  async function discard() {
    if (draft?.pending) await chrome.storage.local.remove(`save-${draft.pending.operationId}`);
    draft = undefined; persist();
  }
  function payload(page) {
    if (!draft.pageId) return { deckId: draft.deckId, mainKey: draft.mainKey ?? '',
      ...(draft.context ? { context: draft.context } : {}), manual: added().map(textBlocks) };
    const hasContext = page?.components.some(component => component.kind === 'context');
    return { pageId: draft.pageId, changes: changed().map(componentId => ({ componentId, content: textBlocks(draft.texts[componentId]) })),
      added: added().map(textBlocks), ...(draft.context && !hasContext ? { context: textBlocks(draft.context) } : {}) };
  }
  async function save(page) {
    if (busy || !draft) return false;
    const key = page?.components.find(component => component.kind === 'main_key');
    const mainKey = draft.pageId ? draft.texts[key?.id] : draft.mainKey;
    if (mainKey !== undefined && !mainKey.trim()) {
      draft.error = 'Enter a main key.'; draft.errorCode = 'invalid'; persist(); void refresh(); return false;
    }
    const next = payload(page);
    if (draft.pageId && !next.changes.length && !next.added.length && !next.context) { await discard(); void refresh(); return true; }
    if (draft.pending && JSON.stringify(next) !== JSON.stringify(draft.pending.payload)) {
      await chrome.storage.local.remove(`save-${draft.pending.operationId}`); draft.pending = undefined;
    }
    draft.pending ??= { operationId: crypto.randomUUID(), type: draft.pageId ? 'save-page' : 'create-page', payload: next };
    busy = true; draft.error = undefined; persist(); void refresh();
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
  // replace; the user confirms, and the retry carries that digest back.
  async function generate(page, target) {
    const request = confirmation => send({ type: 'generate-page', payload: { pageId: page.id, target, ...(confirmation ? { confirmation } : {}) } });
    try {
      if (target.scope === 'missing') { await applyState(await request()); return; }
      let warning = target.scope === 'page' ? RETRY_PAGE : RETRY_COMPONENT;
      for (let round = 0; round < 3; round++) {
        let confirmation;
        try { await applyState(await request(confirmation)); return; }
        catch (error) {
          if (error.code !== 'confirmation_required') throw error;
          confirmation = error.details?.confirmation;
        }
        const choice = await dialog({ title: target.scope === 'page' ? 'Retry this page?' : 'Retry this component?', message: warning, choices: ['Cancel', 'Confirm'] });
        if (choice.choice !== 'Confirm') return;
        try { await applyState(await request(confirmation)); return; }
        catch (error) {
          if (error.code !== 'confirmation_required') throw error;
          warning = CHANGED + (target.scope === 'page' ? RETRY_PAGE : RETRY_COMPONENT);
        }
      }
    } catch (error) { showError(error); }
  }
  function render(hash, local, externalError) {
    const [, id] = hash.split('/');
    const isNew = hash.startsWith('#new-page/');
    const account = getAccount();
    const page = isNew ? undefined : account.pages.find(page => page.id === id);
    const deck = account.decks.find(deck => deck.id === (isNew ? id : page?.deckId ?? draft?.deckId));
    if (isNew && deck && !matches(hash)) beginNew(deck.id, hash);
    const editing = Boolean(matches(hash));
    if (editing && page) {
      for (const component of page.components) {
        if (!Object.hasOwn(draft.texts, component.id)) draft.base[component.id] = draft.texts[component.id] = blockText(component.content);
      }
      persist();
    }
    const pendingSaves = Object.entries(local).filter(([key, item]) => key.startsWith('save-') && item?.state !== 'saving').map(([, item]) => item);
    renderView(PageView, {
      page, deck, draft, isNew, editing, busy, error: externalError, navigate, persist, pendingSaves,
      redraw: () => void refresh(),
      retryPendingSave: async operationId => {
        try { const next = await send({ type: 'try-saving-again', operationId }); await applyState(next); }
        catch (error) { showError(error); }
      },
      begin: () => { begin(page, hash); void refresh(); },
      save: () => save(page),
      cancel: async () => { await discard(); if (isNew) navigate(`deck/${deck.id}`); else void refresh(); },
      discardUnavailable: async () => { await discard(); navigate(''); },
      deletePage: async () => {
        const decision = await dialog({ title: 'Delete page?', message: 'This page and all its components will be deleted.', choices: ['Cancel', 'Delete page'] });
        if (decision.choice !== 'Delete page') return;
        try { const next = await send({ type: 'delete-page', payload: { pageId: page.id } }); await discard(); await applyState(next); navigate(`deck/${deck.id}`); }
        catch (error) { showError(error); }
      },
      generate: target => generate(page, target)
    });
  }
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  return { render, leave, dirty, isEditing: () => Boolean(draft), matches, busy: () => busy };
}
