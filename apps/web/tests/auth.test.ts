import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticate,
  createSession,
  requestEmailCode,
  verifyEmailCode,
  hash,
  limit,
} from "../lib/auth";
import { database } from "./helpers";
const config = {
  AUTH_SECRET: "test-secret-only-never-production-12345678",
  RESEND_API_KEY: "test",
  EMAIL_FROM: "test@example.test",
};
test("sessions isolate accounts, expire, and are stored as hashes", async () => {
  const { store, close } = database();
  await store.ensure("alice", "alice", "preview");
  await store.ensure("bob", "bob", "preview");
  const token = await createSession(store, "alice");
  assert.equal(
    await authenticate(
      new Request("https://example.test/api/sync", {
        headers: { Authorization: "Bearer " + token },
      }),
      store,
    ),
    "alice",
  );
  await assert.rejects(() =>
    authenticate(
      new Request("https://example.test/api/sync", {
        headers: { Authorization: "Bearer made-up" },
      }),
      store,
    ),
  );
  const row = await store.db
    .prepare("SELECT token_hash FROM sessions WHERE owner=?")
    .bind("alice")
    .first<{ token_hash: string }>();
  assert.equal(row?.token_hash, await hash(token));
  assert.notEqual(row?.token_hash, token);
  await store.db.prepare("UPDATE sessions SET expires=0 WHERE owner=?").bind("alice").run();
  await assert.rejects(() =>
    authenticate(
      new Request("https://example.test/api/sync", {
        headers: { Authorization: "Bearer " + token },
      }),
      store,
    ),
  );
  close();
});
test("verification codes are single-use, bounded, and grant only once per identity", async () => {
  const { store, close } = database();
  let code = "";
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const data = JSON.parse(String(init?.body));
    code = data.text.match(/\b\d{6}\b/)[0];
    return Response.json({ id: "test-email" });
  };
  try {
    const id = await requestEmailCode(store, "a@example.test", config, "test-ip");
    const outcomes = await Promise.allSettled([
      verifyEmailCode(store, id, code, config),
      verifyEmailCode(store, id, code, config),
    ]);
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    const owner = "email:" + (await hash("a@example.test"));
    await store.mutate(owner, (s) => {
      s.allowance.used = 12;
    });
    const next = await requestEmailCode(store, "a@example.test", config, "test-ip");
    await verifyEmailCode(store, next, code, config);
    assert.equal((await store.read(owner)).allowance.used, 12);
    const bounded = await requestEmailCode(store, "b@example.test", config, "test-ip");
    const right = code;
    for (let i = 0; i < 5; i++)
      await assert.rejects(() =>
        verifyEmailCode(store, bounded, right === "000000" ? "111111" : "000000", config),
      );
    await assert.rejects(() => verifyEmailCode(store, bounded, right, config));
  } finally {
    globalThis.fetch = original;
    close();
  }
});
test("expired codes and missing production configuration fail closed", async () => {
  const { store, close } = database();
  const original = globalThis.fetch;
  let code = "";
  globalThis.fetch = async (_i, init) => {
    code = JSON.parse(String(init?.body)).text.match(/\b\d{6}\b/)[0];
    return Response.json({ id: "test" });
  };
  try {
    await assert.rejects(() => requestEmailCode(store, "a@example.test", {}, "ip"));
    const id = await requestEmailCode(store, "a@example.test", config, "ip");
    await store.db.prepare("UPDATE challenges SET expires=0 WHERE id=?").bind(id).run();
    await assert.rejects(() => verifyEmailCode(store, id, code, config));
  } finally {
    globalThis.fetch = original;
    close();
  }
});
test("concurrent rate limits are enforced atomically", async () => {
  const { store, close } = database();
  const results = await Promise.allSettled(
    Array.from({ length: 7 }, () => limit(store, "attempt", 5, 60000)),
  );
  assert.ok(results.filter((r) => r.status === "fulfilled").length <= 5);
  assert.ok(results.some((r) => r.status === "rejected"));
  close();
});
