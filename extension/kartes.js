import { dialog } from './dialog.ts';
import { KarteView } from './karte-view.tsx';
/** @typedef {import('../types/editor-drafts.js').KarteEditorDraft} KarteEditorDraft */
const RETRY_WARNING = 'Retry will delete all content on this seite, including manual edits and previous generated content, and generate it again. Other seites will not change.';

export function karteViews({ getAccount, renderView, refresh, send, applyState, navigate, showError }) {
  /** @type {KarteEditorDraft | undefined} */
  let draft;
  try { draft = JSON.parse(sessionStorage.getItem('card-draft')); } catch { /* No recoverable draft. */ }
  let busy = false;
  const persist = () => draft ? sessionStorage.setItem('card-draft', JSON.stringify(draft)) : sessionStorage.removeItem('card-draft');
  const identity = hash => hash.split('/').slice(0, 2).join('/');
  const matches = hash => draft && identity(hash) === draft.route;
  const dirty = () => Boolean(draft && (!draft.cardId || Object.keys(draft.texts).some(id => draft.texts[id] !== draft.base[id])));
  function begin(karte, route) {
    draft = { route: identity(route), cardId: karte.id, deckId: karte.deck_id, base: {}, texts: {}, pageIds: karte.pages.map(seite => seite.page_id) };
    for (const seite of karte.pages) draft.base[seite.page_id] = draft.texts[seite.page_id] = seite.text;
    persist();
  }
  async function discard() {
    if (draft?.pending) await chrome.storage.local.remove(`save-${draft.pending.operationId}`);
    draft = undefined; persist();
  }
  async function save() {
    if (busy || !draft) return false;
    const payload = draft.cardId
      ? { cardId: draft.cardId, changes: Object.keys(draft.texts).filter(id => draft.texts[id] !== draft.base[id]).map(seiteId => ({ pageId: seiteId, text: draft.texts[seiteId] })) }
      : { deckId: draft.deckId, pages: Object.keys(draft.texts).map(seiteId => ({ pageId: seiteId, text: draft.texts[seiteId] })) };
    if (draft.cardId && !payload.changes.length) { await discard(); void refresh(); return true; }
    if (draft.pending && JSON.stringify(payload) !== JSON.stringify(draft.pending.payload)) {
      await chrome.storage.local.remove(`save-${draft.pending.operationId}`); draft.pending = undefined;
    }
    draft.pending ??= { operationId: crypto.randomUUID(), type: draft.cardId ? 'save-card' : 'create-card', payload };
    busy = true; draft.error = undefined; persist(); void refresh();
    try {
      const next = await send(draft.pending);
      const wasNew = !draft.cardId;
      const karteId = next.saved?.cardId ?? draft.cardId;
      draft = undefined; persist(); await applyState(next, false);
      if (wasNew) navigate(`card/${karteId}`); else void refresh();
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
    const [, id, selectedSeiteId] = hash.split('/');
    const isNew = hash.startsWith('#new-card/');
    const account = getAccount();
    let karte = account.cards.find(karte => karte.id === id);
    const deck = account.decks.find(deck => deck.id === (isNew ? id : karte?.deck_id ?? draft?.deckId));
    if (isNew && deck) {
      karte = { deck_id: deck.id, selected_text: null, pages: deck.pages.map(seite => ({ page_id: seite.id, text: '', status: null })) };
      if (!matches(hash)) begin(karte, hash);
    }
    const editing = Boolean(matches(hash));
    if (editing && karte) {
      for (const seite of karte.pages) if (!Object.hasOwn(draft.texts, seite.page_id)) draft.base[seite.page_id] = draft.texts[seite.page_id] = seite.text;
      persist();
    }
    const pendingSaves = Object.entries(local).filter(([key, item]) => key.startsWith('save-') && item?.state !== 'saving').map(([, item]) => item);
    renderView(KarteView, {
      card: karte, deck, draft, selectedPageId: selectedSeiteId, isNew, editing, busy, error: externalError, navigate, persist, pendingSaves,
      retryPendingSave: async operationId => {
        try { const next = await send({ type: 'try-saving-again', operationId }); await applyState(next); }
        catch (error) { showError(error); }
      },
      begin: () => { begin(karte, hash); void refresh(); },
      save,
      cancel: async () => { await discard(); if (isNew) navigate(`deck/${deck.id}`); else void refresh(); },
      discardUnavailable: async () => { await discard(); navigate(''); },
      deleteKarte: async () => {
        const decision = await dialog({ title: 'Delete karte?', message: 'This karte and all its seite content will be deleted.', choices: ['Cancel', 'Delete karte'] });
        if (decision.choice !== 'Delete karte') return;
        try { const next = await send({ type: 'delete-card', payload: { cardId: karte.id } }); await discard(); await applyState(next); navigate(`deck/${deck.id}`); }
        catch (error) { showError(error); }
      },
      retrySeite: async seiteId => {
        const choice = await dialog({ title: 'Retry this seite?', message: RETRY_WARNING, choices: ['Cancel', 'Confirm'] });
        if (choice.choice !== 'Confirm') return;
        try { const next = await send({ type: 'retry-page', payload: { cardId: karte.id, pageId: seiteId } }); await applyState(next); }
        catch (error) { showError(error); }
      }
    });
  }
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  return { render, leave, dirty, isEditing: () => Boolean(draft), matches, busy: () => busy };
}
