import { dialog } from './dialog.js';
import { CardView } from './card-view.tsx';
/** @typedef {import('../types/editor-drafts.js').CardEditorDraft} CardEditorDraft */
const RETRY_WARNING = 'Retry will delete all content on this page, including manual edits and previous generated content, and generate it again. Other pages will not change.';

export function cardViews({ getAccount, renderView, refresh, send, applyState, navigate, showError }) {
  /** @type {CardEditorDraft | undefined} */
  let draft;
  try { draft = JSON.parse(sessionStorage.getItem('card-draft')); } catch { /* No recoverable draft. */ }
  let busy = false;
  const persist = () => draft ? sessionStorage.setItem('card-draft', JSON.stringify(draft)) : sessionStorage.removeItem('card-draft');
  const identity = hash => hash.split('/').slice(0, 2).join('/');
  const matches = hash => draft && identity(hash) === draft.route;
  const dirty = () => Boolean(draft && (!draft.cardId || Object.keys(draft.texts).some(id => draft.texts[id] !== draft.base[id])));
  function begin(card, route) {
    draft = { route: identity(route), cardId: card.id, deckId: card.deck_id, base: {}, texts: {}, pageIds: card.pages.map(page => page.page_id) };
    for (const page of card.pages) draft.base[page.page_id] = draft.texts[page.page_id] = page.text;
    persist();
  }
  async function discard() {
    if (draft?.pending) await chrome.storage.local.remove(`save-${draft.pending.operationId}`);
    draft = undefined; persist();
  }
  async function save() {
    if (busy || !draft) return false;
    const payload = draft.cardId
      ? { cardId: draft.cardId, changes: Object.keys(draft.texts).filter(id => draft.texts[id] !== draft.base[id]).map(pageId => ({ pageId, text: draft.texts[pageId] })) }
      : { deckId: draft.deckId, pages: Object.keys(draft.texts).map(pageId => ({ pageId, text: draft.texts[pageId] })) };
    if (draft.cardId && !payload.changes.length) { await discard(); void refresh(); return true; }
    if (draft.pending && JSON.stringify(payload) !== JSON.stringify(draft.pending.payload)) {
      await chrome.storage.local.remove(`save-${draft.pending.operationId}`); draft.pending = undefined;
    }
    draft.pending ??= { operationId: crypto.randomUUID(), type: draft.cardId ? 'save-card' : 'create-card', payload };
    busy = true; draft.error = undefined; persist(); void refresh();
    try {
      const next = await send(draft.pending);
      const wasNew = !draft.cardId;
      const cardId = next.saved?.cardId ?? draft.cardId;
      draft = undefined; persist(); await applyState(next, false);
      if (wasNew) navigate(`card/${cardId}`); else void refresh();
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
    return save();
  }
  function render(hash, local, externalError) {
    const [, id, selectedPageId] = hash.split('/');
    const isNew = hash.startsWith('#new-card/');
    const account = getAccount();
    let card = account.cards.find(card => card.id === id);
    const deck = account.decks.find(deck => deck.id === (isNew ? id : card?.deck_id ?? draft?.deckId));
    if (isNew && deck) {
      card = { deck_id: deck.id, selected_text: null, pages: deck.pages.map(page => ({ page_id: page.id, text: '', status: null })) };
      if (!matches(hash)) begin(card, hash);
    }
    const editing = Boolean(matches(hash));
    if (editing && card) {
      for (const page of card.pages) if (!Object.hasOwn(draft.texts, page.page_id)) draft.base[page.page_id] = draft.texts[page.page_id] = page.text;
      persist();
    }
    const pendingSaves = Object.entries(local).filter(([key, item]) => key.startsWith('save-') && item?.state !== 'saving').map(([, item]) => item);
    renderView(CardView, {
      card, deck, draft, selectedPageId, isNew, editing, busy, error: externalError, navigate, persist, pendingSaves,
      retryPendingSave: async operationId => {
        try { const next = await send({ type: 'try-saving-again', operationId }); await applyState(next); }
        catch (error) { showError(error); }
      },
      begin: () => { begin(card, hash); void refresh(); },
      save,
      cancel: async () => { await discard(); if (isNew) navigate(`deck/${deck.id}`); else void refresh(); },
      discardUnavailable: async () => { await discard(); navigate(''); },
      deleteCard: async () => {
        const decision = await dialog({ title: 'Delete card?', message: 'This card and all its page content will be deleted.', choices: ['Cancel', 'Delete card'] });
        if (decision.choice !== 'Delete card') return;
        try { const next = await send({ type: 'delete-card', payload: { cardId: card.id } }); await discard(); await applyState(next); navigate(`deck/${deck.id}`); }
        catch (error) { showError(error); }
      },
      retryPage: async pageId => {
        const choice = await dialog({ title: 'Retry this page?', message: RETRY_WARNING, choices: ['Cancel', 'Confirm'] });
        if (choice.choice !== 'Confirm') return;
        try { const next = await send({ type: 'retry-page', payload: { cardId: card.id, pageId } }); await applyState(next); }
        catch (error) { showError(error); }
      }
    });
  }
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  return { render, leave, dirty, isEditing: () => Boolean(draft), matches, busy: () => busy };
}
