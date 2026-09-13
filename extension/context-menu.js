export function captureMenuTitle(name) {
  // Chromium replaces every literal %s and has no %% escape. A zero-width
  // separator preserves its appearance without interpolating the selection.
  return `Create a card in “${name.replaceAll('%s', '%\u200bs')}”`;
}

export function captureMenu(api = chrome) {
  let title;
  const call = invoke => new Promise((resolve, reject) => invoke(() => {
    const error = api.runtime.lastError;
    if (error) reject(new Error(error.message)); else resolve();
  }));
  return async account => {
    const deck = account?.decks.find(deck => deck.id === account.defaultDeckId);
    if (!deck) { await call(done => api.contextMenus.removeAll(done)); title = undefined; return; }
    const next = captureMenuTitle(deck.name);
    if (title === next) return;
    // Update survives worker suspension; create only when the ID is absent.
    try { await call(done => api.contextMenus.update('capture', { title: next, enabled: true }, done)); }
    catch { await call(done => api.contextMenus.create({ id: 'capture', title: next, contexts: ['selection'] }, done)); }
    title = next;
  };
}
