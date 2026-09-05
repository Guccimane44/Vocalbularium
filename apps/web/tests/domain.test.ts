import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initialState,
  applyMutation,
  available,
  eligible,
  validateBackside,
  presetSchema,
  dueCards,
  rateSchedule,
  type AccountState,
  type Mutation,
  type Preset,
} from "../lib/domain";
import { runGeneration, FixtureGenerator } from "../lib/generation";
import { pageFixture } from "../lib/fixtures";
import { database } from "./helpers";
const now = new Date("2026-09-05T12:00:00.000Z");
const preset: Preset = {
  pages: [
    { language: "en", role: "essential", explanation: true, examples: false },
    { language: "de", role: "essential", explanation: true, examples: true },
  ],
  examplePolicy: "both",
  optionalVisibility: "after",
};
const mutation = (
  type: Mutation["type"],
  payload: Record<string, unknown>,
  deviceId = "test-device",
): Mutation => ({ id: crypto.randomUUID(), type, payload, deviceId });
function list(s: AccountState, p = preset) {
  const m = mutation("createList", { name: "My words", preset: p });
  applyMutation(s, m, now);
  return m.id;
}
function capture(s: AccountState, listId: string, expression = "bank") {
  const m = mutation("capture", { listId, expression });
  applyMutation(s, m, now);
  return m;
}
async function prepared(p = preset) {
  const d = database();
  await d.store.ensure("a", "a@example.test", "preview");
  let cardId = "";
  await d.store.mutate("a", (s) => {
    const id = list(s, p);
    cardId = capture(s, id).id;
  });
  await runGeneration(d.store, "a", {});
  return { ...d, cardId };
}
test("three meanings across two languages use two units and one card", async () => {
  const { store, close } = await prepared();
  const s = await store.read("a"),
    c = s.cards[0];
  assert.equal(s.cards.length, 1);
  assert.equal(c.meanings.length, 3);
  assert.equal(s.allowance.used, 2);
  assert.equal(available(s), 98);
  assert.equal(c.pages.en.meanings.filter((m) => m.example).length, 0);
  assert.equal(c.pages.de.meanings.filter((m) => m.example).length, 3);
  assert.deepEqual(
    c.pages.en.meanings.map((m) => m.meaningId),
    c.pages.de.meanings.map((m) => m.meaningId),
  );
  assert.equal(c.reviewRevision, 0);
  close();
});
test("preset rejects no Essential language, duplicate languages, and unsupported modules", () => {
  assert.throws(() =>
    presetSchema.parse({ ...preset, pages: preset.pages.map((p) => ({ ...p, role: "optional" })) }),
  );
  assert.throws(() => presetSchema.parse({ ...preset, pages: [preset.pages[0], preset.pages[0]] }));
  assert.throws(() => presetSchema.parse({ ...preset, etymology: true }));
});
test("Unicode character limit counts user-perceived characters", () => {
  const s = initialState("a", "a", "preview", now),
    id = list(s);
  assert.doesNotThrow(() => capture(s, id, "👩‍👩‍👧‍👦".repeat(120)));
  assert.throws(() => capture(s, id, "a".repeat(121)));
  assert.throws(() => capture(s, id, "  "));
});
test("ordinary duplicate capture and repeated logical request never reserve twice", () => {
  const s = initialState("a", "a", "preview", now),
    id = list(s),
    m = capture(s, id);
  const once = JSON.stringify(s);
  applyMutation(s, m, now);
  assert.equal(JSON.stringify(s), once);
  const duplicate = capture(s, id);
  assert.equal(s.cards.length, 1);
  assert.equal(available(s), 98);
  assert.throws(() =>
    applyMutation(
      s,
      { ...duplicate, payload: { ...duplicate.payload, expression: "different" } },
      now,
    ),
  );
});
test("parallel reservations cannot overspend the last units", async () => {
  const { store, close } = database();
  await store.ensure("a", "a", "preview");
  let id = "";
  await store.mutate("a", (s) => {
    id = list(s);
    s.allowance.used = 97;
  });
  await Promise.all(
    ["bank", "serendipity"].map((expression) =>
      store.mutate("a", (s) =>
        applyMutation(s, mutation("capture", { listId: id, expression }), now),
      ),
    ),
  );
  const s = await store.read("a");
  assert.equal(available(s), 1);
  assert.equal(s.jobs.length, 1);
  assert.equal(s.cards.filter((c) => c.status === "allowance").length, 1);
  close();
});
test("exhaustion saves a capture and never invents a renewal", () => {
  const s = initialState("a", "a", "preview", now),
    id = list(s);
  s.allowance.used = 100;
  capture(s, id);
  assert.equal(s.cards[0].status, "allowance");
  assert.equal(s.jobs.length, 0);
  assert.equal(available(s), 0);
});
test("partial failure charges only successful siblings; retry preserves them", async () => {
  const p = structuredClone(preset);
  p.pages[1].role = "optional";
  const { store, close } = database();
  await store.ensure("a", "a", "preview");
  await store.mutate("a", (s) => {
    capture(s, list(s, p));
  });
  const f = new FixtureGenerator();
  await runGeneration(
    store,
    "a",
    {},
    {
      resolve: (c) => f.resolve(c),
      page: async (c, p) => {
        if (p.language === "de") throw new Error("failed");
        return f.page(c, p);
      },
    },
  );
  let s = await store.read("a");
  assert.equal(s.allowance.used, 1);
  assert.equal(available(s), 99);
  assert.equal(s.cards[0].status, "partial");
  assert.ok(eligible(s.cards[0]));
  const old = s.cards[0].pages.en.id;
  await store.mutate("a", (s) => applyMutation(s, mutation("retry", { cardId: s.cards[0].id })));
  await runGeneration(store, "a", {});
  s = await store.read("a");
  assert.equal(s.allowance.used, 2);
  assert.equal(s.cards[0].pages.en.id, old);
  close();
});
test("missing Essential page blocks review eligibility", async () => {
  const p = structuredClone(preset);
  p.pages[1].language = "es";
  const { store, close } = await prepared(p);
  const s = await store.read("a");
  assert.equal(eligible(s.cards[0]), false);
  assert.equal(s.allowance.used, 1);
  close();
});
test("unknown input remains saved and releases every reservation", async () => {
  const { store, close } = database();
  await store.ensure("a", "a", "preview");
  await store.mutate("a", (s) => capture(s, list(s), "xyzzy-unsupported"));
  await runGeneration(store, "a", {});
  const s = await store.read("a");
  assert.equal(s.cards[0].status, "unknown");
  assert.equal(available(s), 100);
  close();
});
test("strict page validation checks pairing IDs, extras, duplicates, and languages", async () => {
  const { store, close } = await prepared(),
    c = (await store.read("a")).cards[0],
    spec = c.preset.pages[1],
    page = pageFixture(c, spec);
  const wrong = structuredClone(page);
  wrong.meanings[1].meaningId = wrong.meanings[0].meaningId;
  assert.throws(() => validateBackside(wrong, c, spec));
  const duplicate = structuredClone(page);
  duplicate.meanings[1].example = duplicate.meanings[0].example;
  assert.throws(() => validateBackside(duplicate, c, spec));
  assert.throws(() => validateBackside({ ...page, language: "fr" }, c, spec));
  assert.throws(() => validateBackside({ ...page, meanings: page.meanings.slice(1) }, c, spec));
  assert.throws(() => validateBackside({ ...page, inventoryId: "wrong" }, c, spec));
  close();
});
test("all three example policies work when source and target coincide", async () => {
  for (const policy of ["both", "original", "translated"] as const) {
    const p: Preset = {
      pages: [{ language: "en", role: "essential", explanation: true, examples: true }],
      examplePolicy: policy,
      optionalVisibility: "after",
    };
    const { store, close } = await prepared(p),
      c = (await store.read("a")).cards[0];
    assert.equal(c.status, "ready");
    const ex = c.pages.en.meanings[0].example!;
    assert.equal(Boolean(ex.original), policy !== "translated");
    assert.equal(Boolean(ex.translated), policy === "translated");
    close();
  }
});
test("attempt persists target and wording; only one rating advances one schedule", async () => {
  const { store, close } = await prepared();
  let attemptId = "";
  await store.mutate("a", (s) => {
    const r = applyMutation(s, mutation("prepareReview", { cardIds: [s.cards[0].id] }), now) as {
      attemptIds: string[];
    };
    attemptId = r.attemptIds[0];
  });
  let s = await store.read("a"),
    before = JSON.stringify(s.cards[0].schedule);
  assert.equal(s.attempts[0].language, "en");
  await store.mutate("a", (s) => applyMutation(s, mutation("reveal", { attemptId }), now));
  s = await store.read("a");
  assert.equal(JSON.stringify(s.cards[0].schedule), before);
  const rating = mutation("rate", { attemptId, rating: 3, occurredAt: now.toISOString() });
  await store.mutate("a", (s) => applyMutation(s, rating, now));
  await store.mutate("a", (s) => applyMutation(s, rating, now));
  s = await store.read("a");
  assert.equal(s.reviews.length, 1);
  assert.equal(s.cards[0].reviewRevision, 1);
  assert.equal(s.cards[0].rotation, 1);
  assert.equal(s.cards[0].schedule.reps, 1);
  close();
});
test("concurrent observations are retained, with a single canonical transition", async () => {
  const { store, close } = await prepared();
  let a = "";
  await store.mutate("a", (s) => {
    a = (applyMutation(s, mutation("prepareReview", { cardIds: [s.cards[0].id] }), now) as any)
      .attemptIds[0];
    applyMutation(s, mutation("reveal", { attemptId: a }), now);
  });
  await Promise.all(
    ["phone", "browser"].map((device) =>
      store.mutate("a", (s) =>
        applyMutation(
          s,
          mutation("rate", { attemptId: a, rating: 3, occurredAt: now.toISOString() }, device),
          now,
        ),
      ),
    ),
  );
  const s = await store.read("a");
  assert.equal(s.reviews.length, 2);
  assert.equal(s.reviews.filter((r) => r.applied).length, 1);
  assert.equal(s.cards[0].rotation, 1);
  close();
});
test("Essential rotation survives retries and uses one FSRS state", async () => {
  const { store, close } = await prepared();
  await store.mutate("a", (s) => {
    const c = s.cards[0],
      a = (applyMutation(s, mutation("prepareReview", { cardIds: [c.id] }), now) as any)
        .attemptIds[0];
    applyMutation(s, mutation("reveal", { attemptId: a }), now);
    applyMutation(
      s,
      mutation("rate", { attemptId: a, rating: 1, occurredAt: now.toISOString() }),
      now,
    );
    const later = new Date(+now + 86400000),
      b = (applyMutation(s, mutation("prepareReview", { cardIds: [c.id] }), later) as any)
        .attemptIds[0];
    assert.equal(s.attempts.find((x) => x.id === b)?.language, "de");
    const again = (applyMutation(s, mutation("prepareReview", { cardIds: [c.id] }), later) as any)
      .attemptIds[0];
    assert.equal(again, b);
  });
  close();
});
test("rating without reveal and clock skew are rejected", async () => {
  const { store, close } = await prepared();
  await store.mutate("a", (s) => {
    const a = (
      applyMutation(s, mutation("prepareReview", { cardIds: [s.cards[0].id] }), now) as any
    ).attemptIds[0];
    assert.throws(() =>
      applyMutation(
        s,
        mutation("rate", { attemptId: a, rating: 3, occurredAt: now.toISOString() }),
        now,
      ),
    );
    applyMutation(s, mutation("reveal", { attemptId: a }), now);
    assert.throws(() =>
      applyMutation(
        s,
        mutation("rate", {
          attemptId: a,
          rating: 3,
          occurredAt: new Date(+now + 3600000).toISOString(),
        }),
        now,
      ),
    );
  });
  close();
});
test("regeneration retains active answer snapshots and learning history", async () => {
  const { store, close } = await prepared();
  let oldPage = "",
    schedule = "";
  await store.mutate("a", (s) => {
    const c = s.cards[0];
    applyMutation(s, mutation("prepareReview", { cardIds: [c.id] }), now);
    oldPage = s.attempts[0].page.id;
    schedule = JSON.stringify(c.schedule);
    applyMutation(s, mutation("regenerate", { cardId: c.id }), now);
  });
  await runGeneration(store, "a", {});
  const s = await store.read("a");
  assert.equal(s.attempts[0].page.id, oldPage);
  assert.notEqual(s.cards[0].pages.en.id, oldPage);
  assert.equal(JSON.stringify(s.cards[0].schedule), schedule);
  assert.equal(s.allowance.used, 4);
  close();
});
test("deletion during generation prevents publication and releases units", async () => {
  const { store, close } = database();
  await store.ensure("a", "a", "preview");
  await store.mutate("a", (s) => capture(s, list(s)));
  let resume!: () => void;
  const pause = new Promise<void>((r) => {
    resume = r;
  });
  let started!: () => void;
  const signal = new Promise<void>((r) => {
    started = r;
  });
  const f = new FixtureGenerator();
  const running = runGeneration(
    store,
    "a",
    {},
    {
      resolve: async (c) => {
        started();
        await pause;
        return f.resolve(c);
      },
      page: (c, p) => f.page(c, p),
    },
  );
  await signal;
  await store.mutate("a", (s) =>
    applyMutation(s, mutation("deleteCard", { cardId: s.cards[0].id }), now),
  );
  resume();
  await running;
  const s = await store.read("a");
  assert.ok(s.cards[0].deletedAt);
  assert.equal(Object.keys(s.cards[0].pages).length, 0);
  assert.equal(available(s), 100);
  close();
});
test("job lease recovery survives restart without charging a sibling twice", async () => {
  const { store, close } = database();
  await store.ensure("a", "a", "preview");
  await store.mutate("a", (s) => {
    capture(s, list(s));
    s.jobs[0].status = "running";
    s.jobs[0].lease = "terminated-worker";
    s.jobs[0].leaseUntil = 0;
  });
  await runGeneration(store, "a", {});
  await runGeneration(store, "a", {});
  const s = await store.read("a");
  assert.equal(s.allowance.used, 2);
  close();
});
test("stale settings edits are rejected and language interests cost nothing", () => {
  const s = initialState("a", "a", "preview", now),
    id = list(s);
  applyMutation(s, mutation("updateList", { id, baseRevision: 1, name: "Renamed", preset }), now);
  assert.throws(() =>
    applyMutation(s, mutation("updateList", { id, baseRevision: 1, name: "Stale", preset }), now),
  );
  applyMutation(
    s,
    mutation("preferences", {
      baseRevision: 0,
      preferences: { ...s.preferences, interestingLanguages: ["fr", "tl"] },
    }),
    now,
  );
  assert.deepEqual(
    s.lists[0].preset.pages.map((p) => p.language),
    ["en", "de"],
  );
  assert.equal(available(s), 100);
});
test("persistent state survives database close and reopen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vocab-test-")),
    path = join(dir, "library.sqlite");
  let d = database(path);
  await d.store.ensure("a", "a", "preview");
  await d.store.mutate("a", (s) => capture(s, list(s)));
  d.close();
  d = database(path);
  assert.equal((await d.store.read("a")).jobs.length, 1);
  d.close();
  rmSync(dir, { recursive: true });
});
test("account deletion revokes access and cannot be undone by ensure or stale mutations", async () => {
  const { store, close } = database();
  await store.ensure("a", "a", "preview");
  await store.delete("a");
  await assert.rejects(() => store.read("a"));
  await assert.rejects(() => store.ensure("a", "a", "preview"));
  await assert.rejects(() => store.mutate("a", (s) => list(s)));
  close();
});
test("pinned FSRS initial ratings have reproducible due times and states", () => {
  const s = initialState("a", "a", "preview", now);
  capture(s, list(s));
  const c = s.cards[0];
  const again = rateSchedule(c.schedule, 1, now),
    good = rateSchedule(c.schedule, 3, now),
    easy = rateSchedule(c.schedule, 4, now);
  assert.equal(again.reps, 1);
  assert.equal(+new Date(again.due) - +now, 60000);
  assert.equal(good.reps, 1);
  assert.equal(good.state, 1);
  assert.ok(+new Date(easy.due) > +new Date(good.due));
  assert.deepEqual(rateSchedule(c.schedule, 3, now), good);
});
