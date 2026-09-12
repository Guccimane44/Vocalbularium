import { dialog } from './dialog.js';
const RETRY_WARNING = 'Retry will delete all content on this page, including manual edits and previous generated content, and generate it again. Other pages will not change.';

export function cardViews({ app, getAccount, element, button, statusLabel, send, applyState, navigate, showError }) {
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
    if (draft.cardId && !payload.changes.length) { await discard(); render(location.hash); return true; }
    if (draft.pending && JSON.stringify(payload) !== JSON.stringify(draft.pending.payload)) {
      await chrome.storage.local.remove(`save-${draft.pending.operationId}`); draft.pending = undefined;
    }
    draft.pending ??= { operationId: crypto.randomUUID(), type: draft.cardId ? 'save-card' : 'create-card', payload };
    busy = true; draft.error = undefined; persist(); render(location.hash);
    try {
      const next = await send(draft.pending);
      const wasNew = !draft.cardId;
      const cardId = next.saved?.cardId ?? draft.cardId;
      draft = undefined; persist(); await applyState(next, false);
      if (wasNew) navigate(`card/${cardId}`); else render(location.hash);
      return true;
    } catch (error) {
      draft.error = error.message; draft.errorCode = error.code; persist(); return false;
    } finally { busy = false; if (draft) render(location.hash); }
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
  function render(hash) {
    const [, id, selectedPageId] = hash.split('/');
    const isNew = hash.startsWith('#new-card/');
    const account = getAccount();
    let card = account.cards.find(card => card.id === id);
    const deck = account.decks.find(deck => deck.id === (isNew ? id : card?.deck_id ?? draft?.deckId));
    if (isNew && deck) {
      card = { deck_id: deck.id, selected_text: null, pages: deck.pages.map(page => ({ page_id: page.id, text: '', status: null })) };
      if (!matches(hash)) begin(card, hash);
    }
    app.replaceChildren();
    if (!card || !deck) {
      app.append(element('h1', 'Card unavailable'), element('p', 'This card or deck has been deleted.'));
      if (draft) {
        app.append(element('p', 'Your unsaved text is still here. Copy anything you want to keep before discarding it.', 'notice'));
        for (const text of Object.values(draft.texts)) app.append(element('pre', text));
        app.append(button('Discard draft', async () => { await discard(); navigate(''); }));
      }
      return;
    }
    const editing = matches(hash);
    const selected = card.pages.find(page => page.page_id === selectedPageId) ?? card.pages[0];
    if (editing) {
      for (const page of card.pages) if (!Object.hasOwn(draft.texts, page.page_id)) draft.base[page.page_id] = draft.texts[page.page_id] = page.text;
      persist();
    }
    app.append(button(`← ${deck.name}`, () => navigate(`deck/${deck.id}`), 'back'), element('h1', isNew ? 'A new card.' : 'Card content'));
    if (card.status) app.append(statusLabel(card.status, 'Card: '));
    const bar = element('nav', undefined, 'pages'); bar.setAttribute('aria-label', 'Card pages');
    card.pages.forEach((page, index) => {
      const tab = button(`Page ${index + 1}`, () => navigate(`${isNew ? 'new-card' : 'card'}/${id}/${page.page_id}`));
      tab.setAttribute('aria-current', String(page === selected)); bar.append(tab);
    });
    app.append(bar);
    const panel = element('section', undefined, 'card-page');
    if (selected.status) panel.append(statusLabel(selected.status, 'Page: '));
    if (editing) {
      const label = element('label', `Page ${card.pages.indexOf(selected) + 1} content`); label.htmlFor = 'page-content';
      const input = element('textarea'); input.id = 'page-content'; input.rows = 12; input.value = draft.texts[selected.page_id];
      input.readOnly = busy || selected.status === 'loading' || Boolean(draft.pending && !draft.errorCode);
      input.oninput = () => { draft.texts[selected.page_id] = input.value; persist(); };
      panel.append(label, input);
      if (selected.status === 'loading') panel.append(element('p', 'This page is generating. Your draft is preserved; save explicitly after generation finishes.', 'notice'));
      for (const pageId of Object.keys(draft.texts).filter(pageId => !card.pages.some(page => page.page_id === pageId))) {
        panel.append(element('p', 'A draft page was removed from the deck. Its unsaved text is preserved below.', 'notice'), element('pre', draft.texts[pageId]));
      }
      const actions = element('div', undefined, 'dialog-actions');
      const cancel = button('Cancel', async () => { await discard(); if (isNew) navigate(`deck/${deck.id}`); else render(hash); }); cancel.disabled = busy;
      const submit = button(draft.pending ? 'Try saving again' : 'Save', save, 'primary'); submit.disabled = busy;
      actions.append(cancel, submit);
      if (!isNew) {
        const remove = button('Delete card', async () => {
          const decision = await dialog({ title: 'Delete card?', message: 'This card and all its page content will be deleted.', choices: ['Cancel', 'Delete card'] });
          if (decision.choice !== 'Delete card') return;
          try { const next = await send({ type: 'delete-card', payload: { cardId: card.id } }); await discard(); await applyState(next); navigate(`deck/${deck.id}`); }
          catch (error) { showError(error); }
        }); remove.disabled = busy; actions.prepend(remove);
      }
      panel.append(actions);
      if (draft.error) { const notice = element('p', draft.error, 'notice error'); notice.setAttribute('role', 'alert'); panel.append(notice); }
    } else {
      panel.append(selected.text ? element('pre', selected.text) : element('p', selected.status === 'loading' ? 'Generating this page…' : selected.status === 'failed' ? 'Generation failed for this page.' : 'This page is empty.', 'muted'));
      const actions = element('div', undefined, 'dialog-actions');
      const edit = button('Edit card manually', () => { begin(card, hash); render(hash); }); edit.disabled = selected.status === 'loading'; actions.append(edit);
      if (card.selected_text !== null) {
        const retry = button('Retry', async () => {
          const choice = await dialog({ title: 'Retry this page?', message: RETRY_WARNING, choices: ['Cancel', 'Confirm'] });
          if (choice.choice !== 'Confirm') return;
          retry.disabled = true;
          try { const next = await send({ type: 'retry-page', payload: { cardId: card.id, pageId: selected.page_id } }); await applyState(next); }
          catch (error) { showError(error); }
        }); retry.disabled = selected.status === 'loading'; actions.append(retry);
      }
      panel.append(actions);
    }
    app.append(panel);
  }
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  return { render, leave, dirty, isEditing: () => Boolean(draft), matches, busy: () => busy };
}
