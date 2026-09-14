import { dialog } from './dialog.js';

// A native disclosure keeps normal Tab/Enter navigation for its action buttons.
export function deckActions({ deck, getAccount, element, button, send, applyState, configure, showError }) {
  const menu = element('details', undefined, 'deck-menu');
  const summary = element('summary', '•••');
  summary.setAttribute('aria-label', `Options for ${deck.name}`);
  summary.dataset.deckOptions = deck.id;
  menu.append(summary);
  const close = () => { menu.open = false; summary.focus(); };
  const action = (label, run) => button(label, async () => {
    close();
    try { await run(); } catch (error) { showError(error); }
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) { event.preventDefault(); event.stopPropagation(); close(); }
  });
  menu.addEventListener('focusout', event => { if (!menu.contains(event.relatedTarget)) menu.open = false; });
  const choices = element('div', undefined, 'menu-choices');
  const setDefault = action('Set as default', async () => applyState(await send({ type: 'set-default', deckId: deck.id })));
  setDefault.disabled = deck.id === getAccount().defaultDeckId;
  choices.append(setDefault, action('Configure deck', () => configure(deck.id)), action('Delete deck', async () => {
    const account = getAccount();
    const replacements = deck.id === account.defaultDeckId ? account.decks.filter(item => item.id !== deck.id) : [];
    const decision = await dialog({
      title: 'Delete deck?',
      message: `“${deck.name}” and all its cards will be deleted.${account.decks.length === 1 ? ' A new empty My Deck will replace it.' : ''}`,
      choices: ['Cancel', 'Delete deck'],
      select: replacements.length ? { label: 'New default deck', options: replacements.map(item => ({ value: item.id, label: item.name })) } : undefined
    });
    if (decision.choice !== 'Delete deck') return;
    await applyState(await send({ type: 'delete-deck', payload: { deckId: deck.id, replacementId: decision.value } }));
  }));
  menu.append(choices);
  return menu;
}

document.addEventListener('pointerdown', event => {
  for (const menu of document.querySelectorAll('.deck-menu[open]')) if (!menu.contains(event.target)) menu.open = false;
});
