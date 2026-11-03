// @ts-check
// The toolbar badge (D05, K21): captures accepted since the dashboard was last
// opened. The count is kept in local storage so it survives the worker stopping.
/** @param {typeof chrome} [api] */
export function captureBadge(api = chrome) {
  let writes = Promise.resolve();
  /** @param {number} count */
  const text = count => count > 99 ? '99+' : count ? String(count) : '';
  /** @param {(count: number) => number} change */
  function update(change) {
    const next = writes.then(async () => {
      const { captureBadge: count = 0 } = /** @type {{ captureBadge?: number }} */ (await api.storage.local.get('captureBadge'));
      const value = change(count);
      if (value !== count) await api.storage.local.set({ captureBadge: value });
      await api.action.setBadgeBackgroundColor({ color: '#2f4a3a' });
      await api.action.setBadgeTextColor?.({ color: '#ffffff' });
      await api.action.setBadgeText({ text: text(value) });
    });
    writes = next.catch(() => {});
    return next;
  }
  return { added: () => update(count => count + 1), seen: () => update(() => 0), restore: () => update(count => count) };
}
