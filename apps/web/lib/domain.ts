import { z } from "zod";
import { createEmptyCard, fsrs, type Card as FSRSCard, type Grade } from "ts-fsrs";

export const languageSchema = z
  .string()
  .min(2)
  .max(35)
  .refine((value) => {
    try {
      return Intl.getCanonicalLocales(value).length === 1;
    } catch {
      return false;
    }
  }, "Use a valid language tag.");
export const pageSpecSchema = z
  .object({
    language: languageSchema,
    role: z.enum(["essential", "optional"]),
    explanation: z.literal(true),
    examples: z.boolean(),
  })
  .strict();
export const presetSchema = z
  .object({
    pages: z.array(pageSpecSchema).min(1).max(6),
    examplePolicy: z.enum(["both", "original", "translated"]),
    optionalVisibility: z.enum(["after", "hidden"]),
  })
  .strict()
  .superRefine((v, c) => {
    if (!v.pages.some((p) => p.role === "essential"))
      c.addIssue({ code: "custom", message: "At least one language must be Essential." });
    if (new Set(v.pages.map((p) => p.language.toLowerCase())).size !== v.pages.length)
      c.addIssue({ code: "custom", message: "Each language may appear only once." });
  });
export type Preset = z.infer<typeof presetSchema>;
export type PageSpec = z.infer<typeof pageSpecSchema>;
export type Meaning = { id: string; gloss: string; partOfSpeech: string };
export type Example = { original: string | null; translated: string | null };
export type MeaningContent = { meaningId: string; explanation: string; example: Example | null };
export type Backside = {
  id: string;
  language: string;
  inventoryId: string;
  meanings: MeaningContent[];
  createdAt: string;
  provider: string;
};
export type Wordlist = {
  id: string;
  name: string;
  revision: number;
  preset: Preset;
  createdAt: string;
};
export type Card = {
  id: string;
  listId: string;
  expression: string;
  sourceLanguage: string | null;
  inferred: boolean;
  context: string;
  sourceUrl: string;
  sourceHint: string | null;
  inventoryId: string;
  meanings: Meaning[];
  alternatives: { language: string; previews: Record<string, string> }[];
  pages: Record<string, Backside>;
  preset: Preset;
  status: "queued" | "ready" | "partial" | "failed" | "unknown" | "allowance";
  error?: string;
  createdAt: string;
  schedule: FSRSCard;
  reviewRevision: number;
  rotation: number;
  occurrences?: { captureId: string; context: string; sourceUrl: string; capturedAt: string }[];
  deletedAt?: string;
};
export type Job = {
  id: string;
  cardId: string;
  pages: { spec: PageSpec; status: "reserved" | "complete" | "failed"; error?: string }[];
  status: "queued" | "running" | "complete" | "failed";
  lease: string | null;
  leaseUntil: number;
  attempts: number;
  createdAt: string;
  provider: "fixture" | "openai";
};
export type Attempt = {
  id: string;
  cardId: string;
  language: string;
  baseRevision: number;
  inventoryId: string;
  page: Backside;
  preset: Preset;
  createdAt: string;
  completedAt?: string;
  revealedAt?: string;
};
export type Review = {
  id: string;
  attemptId: string;
  cardId: string;
  rating: number;
  language: string;
  page: Backside;
  inventoryId: string;
  baseRevision: number;
  deviceId: string;
  occurredAt: string;
  receivedAt: string;
  applied: boolean;
  reason?: string;
};
export type AccountState = {
  schemaVersion: 1;
  revision: number;
  owner: string;
  email: string;
  mode: "preview" | "live";
  createdAt: string;
  allowance: { grant: number; used: number };
  preferences: {
    interestingLanguages: string[];
    defaultListId: string | null;
    newCardsPerDay: number;
    timeZone: string;
  };
  lists: Wordlist[];
  cards: Card[];
  jobs: Job[];
  attempts: Attempt[];
  reviews: Review[];
  receipts: Record<string, { fingerprint: string; result: unknown }>;
  usage: {
    jobId: string;
    language: string | null;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    attempt: number;
    success: boolean;
    estimatedCostUsd: number | null;
  }[];
  deletedAt?: string;
};
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, message: string): never => {
  throw new DomainError(status, message);
};
export const clone = <T>(v: T): T => structuredClone(v);
export function initialState(
  owner: string,
  email: string,
  mode: "preview" | "live",
  now = new Date(),
): AccountState {
  return {
    schemaVersion: 1,
    revision: 0,
    owner,
    email,
    mode,
    createdAt: now.toISOString(),
    allowance: { grant: 100, used: 0 },
    preferences: {
      interestingLanguages: [],
      defaultListId: null,
      newCardsPerDay: 10,
      timeZone: "UTC",
    },
    lists: [],
    cards: [],
    jobs: [],
    attempts: [],
    reviews: [],
    receipts: {},
    usage: [],
  };
}
export function available(s: AccountState) {
  return (
    s.allowance.grant -
    s.allowance.used -
    s.jobs.flatMap((j) => j.pages).filter((p) => p.status === "reserved").length
  );
}
export function eligible(c: Card) {
  return (
    !c.deletedAt &&
    c.preset.pages
      .filter((p) => p.role === "essential")
      .every((p) => c.pages[p.language]?.inventoryId === c.inventoryId) &&
    c.meanings.length > 0
  );
}
export function dueCards(s: AccountState, now = new Date()) {
  const day = (date: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: s.preferences.timeZone }).format(new Date(date));
  const newToday = new Set(
    s.reviews
      .filter(
        (r) => r.applied && r.baseRevision === 0 && day(r.receivedAt) === day(now.toISOString()),
      )
      .map((r) => r.cardId),
  ).size;
  const cards = s.cards.filter((c) => eligible(c) && new Date(c.schedule.due) <= now);
  return [
    ...cards
      .filter((c) => c.reviewRevision > 0)
      .sort((a, b) => +new Date(a.schedule.due) - +new Date(b.schedule.due)),
    ...cards
      .filter((c) => c.reviewRevision === 0)
      .slice(0, Math.max(0, s.preferences.newCardsPerDay - newToday)),
  ];
}
export const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
export function rateSchedule(card: FSRSCard, rating: number, now: Date): FSRSCard {
  if (![1, 2, 3, 4].includes(rating)) fail(400, "Choose Again, Hard, Good, or Easy.");
  return scheduler.next(card, now, rating as Grade).card;
}
export const inputSchema = z
  .object({
    expression: z
      .string()
      .trim()
      .min(1)
      .refine(
        (s) =>
          [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].length <= 120,
        "Choose a word or short expression of at most 120 characters.",
      ),
    context: z.string().max(1500).default(""),
    sourceUrl: z
      .string()
      .max(2000)
      .default("")
      .refine((s) => !s || /^https?:\/\//i.test(s), "Source must be an HTTP or HTTPS URL."),
    sourceHint: languageSchema.nullable().default(null),
    listId: z.string().min(1).max(100),
  })
  .strict();
export const mutationSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum([
      "createList",
      "updateList",
      "capture",
      "retry",
      "regenerate",
      "deleteCard",
      "preferences",
      "prepareReview",
      "reveal",
      "rate",
      "deleteList",
    ]),
    payload: z.record(z.string(), z.unknown()),
    deviceId: z.string().min(1).max(100),
  })
  .strict();
export type Mutation = z.infer<typeof mutationSchema>;
function cardFor(s: AccountState, id: unknown) {
  return (
    s.cards.find((c) => c.id === id && !c.deletedAt) ??
    fail(404, "This word is no longer available.")
  );
}
function listFor(s: AccountState, id: unknown) {
  return s.lists.find((l) => l.id === id) ?? fail(404, "Wordlist not found.");
}
function queue(s: AccountState, c: Card, id: string, specs: PageSpec[], now: Date) {
  if (!specs.length) return;
  if (s.jobs.some((j) => j.cardId === c.id && j.pages.some((p) => p.status === "reserved")))
    fail(409, "Generation is already in progress.");
  if (available(s) < specs.length) {
    c.status = "allowance";
    c.error =
      "Not enough free generations. Your word is saved; existing words remain available to study.";
    return;
  }
  s.jobs.push({
    id,
    cardId: c.id,
    pages: specs.map((spec) => ({ spec: clone(spec), status: "reserved" })),
    status: "queued",
    lease: null,
    leaseUntil: 0,
    attempts: 0,
    createdAt: now.toISOString(),
    provider: s.mode === "preview" ? "fixture" : "openai",
  });
  c.status = "queued";
  delete c.error;
}
export function cancelCard(s: AccountState, c: Card, now: Date) {
  c.deletedAt = now.toISOString();
  for (const j of s.jobs.filter((j) => j.cardId === c.id)) {
    j.status = "failed";
    j.lease = null;
    for (const p of j.pages)
      if (p.status === "reserved") {
        p.status = "failed";
        p.error = "Word deleted.";
      }
  }
}
export function applyMutation(s: AccountState, m: Mutation, now = new Date()): unknown {
  if (s.deletedAt) fail(410, "This account has been deleted.");
  const fingerprint = JSON.stringify({ type: m.type, payload: m.payload, deviceId: m.deviceId });
  const receipt = s.receipts[m.id];
  if (receipt) {
    if (receipt.fingerprint !== fingerprint)
      fail(409, "This request ID has already been used for different data.");
    return receipt.result;
  }
  const p = m.payload;
  let result: unknown = { ok: true };
  switch (m.type) {
    case "createList": {
      const name = z.string().trim().min(1).max(60).parse(p.name),
        preset = presetSchema.parse(p.preset);
      if (s.lists.length >= 20) fail(409, "The MVP supports up to 20 wordlists.");
      const list: Wordlist = { id: m.id, name, preset, revision: 1, createdAt: now.toISOString() };
      s.lists.push(list);
      s.preferences.defaultListId ??= list.id;
      result = { listId: list.id };
      break;
    }
    case "updateList": {
      const l = listFor(s, p.id);
      if (p.baseRevision !== l.revision)
        fail(409, "This wordlist changed on another device. Refresh before saving.");
      const preset = presetSchema.parse(p.preset);
      l.name = z.string().trim().min(1).max(60).parse(p.name);
      l.preset = preset;
      l.revision++;
      // Settings affect future captures; existing content changes only on explicit regeneration.
      result = { listId: l.id };
      break;
    }
    case "capture": {
      const data = inputSchema.parse(p);
      const list = listFor(s, data.listId);
      const normalized = data.expression.normalize("NFC");
      const existing = s.cards.find(
        (c) =>
          !c.deletedAt &&
          c.listId === list.id &&
          c.expression.normalize("NFC") === normalized &&
          (data.sourceHint
            ? c.sourceLanguage === data.sourceHint || c.sourceHint === data.sourceHint
            : c.sourceHint === null),
      );
      if (existing) {
        (existing.occurrences ??= []).push({
          captureId: m.id,
          context: data.context,
          sourceUrl: data.sourceUrl,
          capturedAt: now.toISOString(),
        });
        if (!existing.meanings.length && data.context && existing.context !== data.context) {
          existing.context = data.context;
          queue(s, existing, m.id + ":job", existing.preset.pages, now);
        }
        result = { cardId: existing.id, reused: true };
        break;
      }
      if (s.cards.filter((c) => !c.deletedAt).length >= 1000)
        fail(409, "This account has reached the MVP limit of 1,000 saved words.");
      const c: Card = {
        id: m.id,
        ...data,
        sourceLanguage: null,
        inferred: false,
        inventoryId: m.id + ":inventory:1",
        meanings: [],
        alternatives: [],
        pages: {},
        preset: clone(list.preset),
        status: "queued",
        createdAt: now.toISOString(),
        schedule: createEmptyCard(now),
        reviewRevision: 0,
        rotation: 0,
      };
      c.occurrences = [
        {
          captureId: m.id,
          context: data.context,
          sourceUrl: data.sourceUrl,
          capturedAt: now.toISOString(),
        },
      ];
      s.cards.push(c);
      queue(s, c, m.id + ":job", c.preset.pages, now);
      result = { cardId: c.id, reused: false };
      break;
    }
    case "retry":
    case "regenerate": {
      const c = cardFor(s, p.cardId);
      if (m.type === "regenerate") c.preset = clone(listFor(s, c.listId).preset);
      const specs =
        m.type === "retry"
          ? c.preset.pages.filter((spec) => !c.pages[spec.language])
          : c.preset.pages.filter((spec) => !p.language || spec.language === p.language);
      queue(s, c, m.id + ":job", specs, now);
      result = { cardId: c.id };
      break;
    }
    case "deleteCard": {
      cancelCard(s, cardFor(s, p.cardId), now);
      break;
    }
    case "deleteList": {
      const l = listFor(s, p.id);
      if (l.revision !== p.baseRevision) fail(409, "Wordlist changed on another device.");
      s.cards
        .filter((c) => c.listId === l.id && !c.deletedAt)
        .forEach((c) => cancelCard(s, c, now));
      s.lists = s.lists.filter((x) => x.id !== l.id);
      if (s.preferences.defaultListId === l.id)
        s.preferences.defaultListId = s.lists[0]?.id ?? null;
      break;
    }
    case "preferences": {
      const prefs = z
        .object({
          interestingLanguages: z.array(languageSchema).max(30),
          defaultListId: z.string().nullable(),
          newCardsPerDay: z.number().int().min(0).max(100),
          timeZone: z.string().refine((v) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }),
        })
        .strict()
        .parse(p.preferences);
      if (p.baseRevision !== s.revision) fail(409, "Your settings changed. Refresh and try again.");
      if (prefs.defaultListId) listFor(s, prefs.defaultListId);
      s.preferences = prefs;
      break;
    }
    case "prepareReview": {
      const due = dueCards(s, now);
      const ids =
        p.cardIds === undefined
          ? due.map((c) => c.id)
          : z.array(z.string()).max(100).parse(p.cardIds);
      result = {
        attemptIds: ids.map((id) => {
          const c = cardFor(s, id);
          const existing = s.attempts.find(
            (a) => a.cardId === id && a.baseRevision === c.reviewRevision && !a.completedAt,
          );
          if (existing) return existing.id;
          if (!due.some((x) => x.id === id))
            fail(409, "This word is not due or an Essential page is missing.");
          const essential = c.preset.pages.filter((x) => x.role === "essential");
          const language = essential[c.rotation % essential.length].language;
          const a: Attempt = {
            id: m.id + ":" + id,
            cardId: id,
            language,
            baseRevision: c.reviewRevision,
            inventoryId: c.inventoryId,
            page: clone(c.pages[language]),
            preset: clone(c.preset),
            createdAt: now.toISOString(),
          };
          s.attempts.push(a);
          return a.id;
        }),
      };
      break;
    }
    case "reveal": {
      const a =
        s.attempts.find((a) => a.id === p.attemptId) ?? fail(404, "Review attempt not found.");
      cardFor(s, a.cardId);
      a.revealedAt ??= now.toISOString();
      break;
    }
    case "rate": {
      const a =
        s.attempts.find((a) => a.id === p.attemptId) ??
        fail(404, "Review attempt not found. Sync before starting another review.");
      const c = cardFor(s, a.cardId);
      if (!a.revealedAt) fail(409, "Reveal the answer before rating.");
      const rating = z.number().int().min(1).max(4).parse(p.rating);
      const occurred = z.iso.datetime().parse(p.occurredAt);
      if (+new Date(occurred) > +now + 5 * 60_000)
        fail(400, "Device time is ahead. Correct your clock and try again.");
      const applied = !a.completedAt && a.baseRevision === c.reviewRevision;
      s.reviews.push({
        id: m.id,
        attemptId: a.id,
        cardId: c.id,
        rating,
        language: a.language,
        page: clone(a.page),
        inventoryId: a.inventoryId,
        baseRevision: a.baseRevision,
        deviceId: m.deviceId,
        occurredAt: occurred,
        receivedAt: now.toISOString(),
        applied,
        ...(!applied
          ? { reason: "Another review already advanced this card from the same revision." }
          : {}),
      });
      if (applied) {
        const time = new Date(
          Math.max(
            +new Date(a.createdAt),
            Math.min(+new Date(occurred), +now),
            c.schedule.last_review ? +new Date(c.schedule.last_review) : 0,
          ),
        );
        c.schedule = rateSchedule(c.schedule, rating, time);
        c.reviewRevision++;
        c.rotation++;
      }
      a.completedAt ??= now.toISOString();
      result = { applied, cardId: c.id };
      break;
    }
  }
  s.receipts[m.id] = { fingerprint, result };
  return result;
}
export const resolvedSchema = z
  .object({
    sourceLanguage: languageSchema.nullable(),
    inferred: z.boolean(),
    meanings: z
      .array(
        z
          .object({ gloss: z.string().min(1).max(500), partOfSpeech: z.string().min(1).max(80) })
          .strict(),
      )
      .max(12),
    alternatives: z
      .array(
        z
          .object({
            language: languageSchema,
            previews: z
              .array(
                z.object({ language: languageSchema, text: z.string().min(1).max(500) }).strict(),
              )
              .max(6),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export const backsideSchema = z
  .object({
    language: languageSchema,
    inventoryId: z.string(),
    meanings: z
      .array(
        z
          .object({
            meaningId: z.string(),
            explanation: z.string().min(1).max(2000),
            example: z
              .object({
                original: z.string().min(1).max(1000).nullable(),
                translated: z.string().min(1).max(1000).nullable(),
              })
              .strict()
              .nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export function validateBackside(value: unknown, c: Card, spec: PageSpec) {
  const page = backsideSchema.parse(value);
  if (page.language !== spec.language || page.inventoryId !== c.inventoryId)
    fail(422, "Generated page does not match its language or meaning revision.");
  if (page.meanings.length !== c.meanings.length) fail(422, "Generated page is missing meanings.");
  const examples = new Set<string>();
  page.meanings.forEach((entry, i) => {
    if (entry.meaningId !== c.meanings[i].id)
      fail(422, "Meaning IDs must match the shared inventory in order.");
    if (!spec.examples && entry.example !== null) fail(422, "Examples were disabled.");
    if (spec.examples) {
      if (!entry.example) fail(422, "Every meaning needs exactly one example.");
      const e = entry.example!;
      const needOriginal = c.preset.examplePolicy !== "translated";
      const needTranslated =
        c.preset.examplePolicy === "translated" ||
        (c.preset.examplePolicy === "both" && c.sourceLanguage !== spec.language);
      if (needOriginal !== Boolean(e.original) || needTranslated !== Boolean(e.translated))
        fail(422, "Example language presentation does not match the wordlist.");
      if (
        c.preset.examplePolicy === "translated" &&
        c.sourceLanguage === spec.language &&
        !e.translated
      )
        fail(422, "An example is required in this language.");
      const key = JSON.stringify(e);
      if (examples.has(key)) fail(422, "Each meaning needs a distinct example.");
      examples.add(key);
    }
  });
  return page;
}
