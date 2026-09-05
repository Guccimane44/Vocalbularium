import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(new URL("../../chrome/background.js", import.meta.url), "utf8");
type Data = Record<string, any>;
function worker(data: Data, fetcher: typeof fetch) {
  let receive: Function = () => {},
    alarm: Function = () => {};
  const chrome = {
    storage: {
      local: {
        get: async (key: string | null) =>
          key === null ? structuredClone(data) : { [key]: structuredClone(data[key]) },
        set: async (values: Data) => {
          Object.assign(data, structuredClone(values));
        },
        remove: async (key: string) => {
          delete data[key];
        },
      },
    },
    runtime: {
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: {
        addListener: (fn: Function) => {
          receive = fn;
        },
      },
    },
    alarms: {
      create: async () => {},
      onAlarm: {
        addListener: (fn: Function) => {
          alarm = fn;
        },
      },
    },
    contextMenus: {
      removeAll: async () => {},
      create: () => {},
      onClicked: { addListener: () => {} },
    },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  };
  runInNewContext(source, {
    chrome,
    fetch: fetcher,
    crypto,
    Intl,
    AbortSignal,
    URL,
    console,
    setTimeout,
  });
  return {
    message: (message: unknown) => new Promise<any>((resolve) => receive(message, {}, resolve)),
    alarm,
  };
}
test("Chrome captures survive worker restart and remain unassigned until explicit action", async () => {
  const data: Data = {},
    offline: typeof fetch = async () => {
      throw new Error("offline");
    };
  const one = worker(data, offline);
  assert.equal((await one.message({ type: "capture", expression: "bank" })).ok, true);
  const key = Object.keys(data).find((k) => k.startsWith("outbox:"))!;
  assert.equal(data[key].owner, null);
  assert.equal(data[key].expression, "bank");
  const two = worker(data, offline);
  await two.message({ type: "sync" });
  assert.ok(data[key]);
  assert.equal((await two.message({ type: "capture", expression: "a".repeat(121) })).ok, false);
});
test("Chrome does not send another account’s outbox", async () => {
  const data: Data = {
    config: {
      url: "https://example.test",
      token: "test",
      owner: "bob",
      listId: "b",
      deviceId: "chrome",
    },
    "outbox:old": { id: "old", owner: "alice", listId: "a", expression: "bank" },
  };
  let writes = 0;
  const w = worker(data, async (url) => {
    if (String(url).endsWith("/sync")) return Response.json({ owner: "bob" });
    writes++;
    return Response.json({ ok: true });
  });
  await w.message({ type: "sync" });
  assert.ok(data["outbox:old"]);
  assert.equal(writes, 1); // Only the generation progress tick, never the capture.
});
test("Chrome retries the same mutation ID after a lost upload acknowledgement", async () => {
  const id = crypto.randomUUID(),
    data: Data = {
      config: {
        url: "https://example.test",
        token: "test",
        owner: "alice",
        listId: "a",
        deviceId: "chrome",
      },
      ["outbox:" + id]: { id, owner: "alice", listId: "a", expression: "bank", sourceUrl: "" },
    };
  const received: string[] = [];
  let fail = true;
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).endsWith("/sync")) return Response.json({ owner: "alice" });
    if (String(url).endsWith("/mutations")) {
      received.push(JSON.parse(String(init?.body)).id);
      if (fail) throw new Error("lost acknowledgement");
    }
    return Response.json({ ok: true });
  };
  await worker(data, fetcher).message({ type: "sync" });
  assert.ok(data["outbox:" + id]);
  fail = false;
  await worker(data, fetcher).message({ type: "sync" });
  assert.equal(data["outbox:" + id], undefined);
  assert.deepEqual(received, [id, id]);
});
