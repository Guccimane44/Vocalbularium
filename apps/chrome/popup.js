const $ = (id) => document.getElementById(id);
let loaded = null;
const say = (text, error = false) => {
  $("status").textContent = text;
  $("status").className = error ? "error" : "";
};
async function refresh() {
  const all = await chrome.storage.local.get(null),
    config = all.config;
  if (config) {
    $("url").value = config.url;
    $("token").value = config.token;
    $("list").replaceChildren(new Option(config.listName, config.listId));
    say(all.lastError ?? "Connected · " + config.listName, Boolean(all.lastError));
  } else {
    $("connection").open = true;
    say("Connect your account, or save a word on this device.");
  }
  $("queue").replaceChildren();
  let drafts = 0;
  for (const [key, item] of Object.entries(all)) {
    if (!key.startsWith("outbox:")) continue;
    if (!item.owner) drafts++;
    const li = document.createElement("li"),
      word = document.createElement("span"),
      state = document.createElement("small");
    word.textContent = item.expression;
    state.textContent =
      item.error ??
      (!item.owner
        ? "Unassigned · saved on this device"
        : item.owner === config?.owner
          ? "Waiting to upload"
          : "Saved for another account");
    li.append(word, state);
    const remove = document.createElement("button");
    remove.className = "secondary";
    remove.textContent = "Remove";
    remove.onclick = async () => {
      await chrome.storage.local.remove(key);
      await refresh();
    };
    li.append(remove);
    $("queue").append(li);
  }
  if (!$("queue").children.length) {
    const li = document.createElement("li");
    li.textContent = "All captures uploaded.";
    $("queue").append(li);
  }
  $("claim").hidden = !drafts || !config;
}
$("capture").onsubmit = async (event) => {
  event.preventDefault();
  const r = await chrome.runtime.sendMessage({
    type: "capture",
    expression: $("expression").value,
  });
  if (r.ok) {
    $("expression").value = "";
    await refresh();
    say("Saved on this device. Upload resumes when connected.");
  } else say(r.error, true);
};
$("load").onclick = async () => {
  try {
    const raw = new URL($("url").value);
    if (raw.protocol !== "https:" && !(raw.protocol === "http:" && raw.hostname === "localhost"))
      throw new Error("Use HTTPS, or localhost for development.");
    const url = raw.origin;
    const granted = await chrome.permissions.request({ origins: [url + "/*"] });
    if (!granted) throw new Error("Service access was not granted.");
    const res = await fetch(url + "/api/sync", {
      credentials: "include",
      headers: { Authorization: "Bearer " + $("token").value.trim() },
    });
    if (!res.ok) throw new Error("Check your service address and device token.");
    const state = await res.json();
    loaded = { url, token: $("token").value.trim(), owner: state.owner };
    $("list").replaceChildren(...state.lists.map((l) => new Option(l.name, l.id)));
    if (!state.lists.length) throw new Error("Create a wordlist in the app first.");
    say("Wordlists loaded. Choose a default and save.");
  } catch (e) {
    say(e.message, true);
  }
};
$("settings").onsubmit = async (event) => {
  event.preventDefault();
  if (
    !loaded ||
    loaded.url !== new URL($("url").value).origin ||
    loaded.token !== $("token").value.trim()
  ) {
    say("Load wordlists before saving this connection.", true);
    return;
  }
  await chrome.storage.local.set({
    config: {
      ...loaded,
      listId: $("list").value,
      listName: $("list").selectedOptions[0].textContent,
      deviceId: crypto.randomUUID(),
    },
  });
  $("connection").open = false;
  await refresh();
};
$("sync").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "sync" });
  await refresh();
};
$("claim").onclick = async () => {
  const r = await chrome.runtime.sendMessage({ type: "claimDrafts" });
  if (!r.ok) say(r.error, true);
  await refresh();
};
$("study").onclick = async () => {
  const { config } = await chrome.storage.local.get("config");
  if (config) chrome.tabs.create({ url: config.url });
  else say("Connect your account first.", true);
};
$("disconnect").onclick = async () => {
  await chrome.storage.local.remove("config");
  $("token").value = "";
  loaded = null;
  await refresh();
};
chrome.storage.onChanged.addListener(() => void refresh());
void refresh();
