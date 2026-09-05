const MENU = "vocabularium-add";
let flushing = false;
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU,
    title: "Add “%s” to Vocabularium",
    contexts: ["selection"],
  });
  await chrome.alarms.create("vocabularium-sync", { periodInMinutes: 1 });
  await flush();
});
chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create("vocabularium-sync", { periodInMinutes: 1 });
  await flush();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "vocabularium-sync") void flush();
});
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU) return;
  try {
    await save(info.selectionText ?? "", info.pageUrl ?? "");
    await chrome.action.setBadgeText({ text: "✓" });
    await chrome.action.setBadgeBackgroundColor({ color: "#285bed" });
    void flush();
  } catch (error) {
    await chrome.storage.local.set({ lastError: error.message });
    await chrome.action.setBadgeText({ text: "!" });
  }
});
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  (async () => {
    if (message.type === "capture") {
      await save(message.expression, "");
      void flush();
      return { ok: true };
    }
    if (message.type === "sync") {
      await flush();
      return { ok: true };
    }
    if (message.type === "claimDrafts") {
      const all = await chrome.storage.local.get(null),
        config = all.config;
      if (!config) throw new Error("Connect your account first.");
      for (const [key, value] of Object.entries(all)) {
        if (key.startsWith("outbox:") && !value.owner)
          await chrome.storage.local.set({
            [key]: { ...value, owner: config.owner, listId: config.listId },
          });
      }
      await flush();
      return { ok: true };
    }
    return { ok: false, error: "Unknown action." };
  })().then(respond, (error) => respond({ ok: false, error: error.message }));
  return true;
});
async function save(expression, sourceUrl) {
  expression = expression.trim();
  if (!expression) throw new Error("Select or enter a word first.");
  if (
    [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(expression)].length > 120
  )
    throw new Error("Choose a word or short expression of at most 120 characters.");
  const { config } = await chrome.storage.local.get("config");
  const id = crypto.randomUUID();
  await chrome.storage.local.set({
    ["outbox:" + id]: {
      id,
      expression,
      sourceUrl,
      owner: config?.owner ?? null,
      listId: config?.listId ?? null,
      createdAt: new Date().toISOString(),
    },
  });
}
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    const all = await chrome.storage.local.get(null),
      config = all.config;
    if (!config) return;
    const response = await fetch(config.url + "/api/sync", {
      headers: { Authorization: "Bearer " + config.token },
      credentials: "include",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Sign in again or check the service address.");
    const account = await response.json();
    if (account.owner !== config.owner)
      throw new Error("The connected account changed. Reconnect before uploading.");
    for (const [key, item] of Object.entries(all)) {
      if (!key.startsWith("outbox:") || item.owner !== account.owner || item.error) continue;
      const mutation = {
        id: item.id,
        type: "capture",
        deviceId: config.deviceId,
        payload: {
          expression: item.expression,
          sourceUrl: item.sourceUrl,
          context: "",
          sourceHint: null,
          listId: item.listId,
        },
      };
      const res = await fetch(config.url + "/api/mutations", {
        method: "POST",
        credentials: "include",
        headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
        body: JSON.stringify(mutation),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) await chrome.storage.local.remove(key);
      else {
        let message = "Upload failed.";
        try {
          message = (await res.json()).error ?? message;
        } catch {}
        if (res.status === 401)
          throw new Error("Your device token expired. Reconnect your account.");
        await chrome.storage.local.set({ [key]: { ...item, error: message } });
      }
    }
    await chrome.storage.local.remove("lastError");
    const remaining = Object.keys(await chrome.storage.local.get(null)).filter((k) =>
      k.startsWith("outbox:"),
    ).length;
    await chrome.action.setBadgeText({ text: remaining ? String(remaining) : "" });
    // Generation jobs are already durable; this tick can resume any interrupted server work.
    void fetch(config.url + "/api/jobs/run", {
      method: "POST",
      credentials: "include",
      headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  } catch (error) {
    await chrome.storage.local.set({ lastError: error.message });
  } finally {
    flushing = false;
  }
}
