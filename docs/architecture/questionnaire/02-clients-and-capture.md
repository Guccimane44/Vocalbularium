# 02 — Clients and capture (Q06–Q10)

Capture is the product's front door: the vision promises saving text without breaking flow. Every new surface multiplies sync, auth, and generation-entrypoint work, so decide the surface list before designing the pipeline behind it.

## Q06. Which clients exist at 1.0?

**Decision:** For each candidate — Chrome extension, hosted web app, Firefox/Safari, iOS share-sheet, Android share, desktop hotkey, audio/YouTube capture — mark must-have, nice, or out.

**Context:** Today only Chrome selection → context menu → default deck exists, using selected text only ([scope](../../product/scope.md), [Select and Add](../../MVP-Product-spec-select-and-add.md)). The vision names hotkeys, sharing, and mobile devices as possibilities, not commitments ([vision](../../product/vision.md)). Each client needs its own auth session, capture endpoint, and update channel.

**Options:**
- Chrome-only 1.0 — one client, one update path (unpacked or Web Store), all effort into capture reliability and modules. Tradeoff: mobile demand stays unserved.
- Chrome + web reader — adds a hosted client and forces the backend to be reachable beyond loopback; unlocks later mobile.
- Full multi-surface — maximum reach; each surface needs offline queuing and session handling, roughly doubling frontend work.

**Answer prompt:** Fill the must/nice/out table with reasons. Research task: log where the owner's real captures occur for two weeks (which browser, which device, which app).

## Q07. What travels with a capture?

**Decision:** Define the capture payload: selected text plus what else — page URL/title, surrounding paragraph, source-language hint, timestamp, user intent?

**Context:** Modules currently receive only the selected text with no surrounding webpage context, plus one interpreted source language ([modules](../../specs/modules.md#current-input-and-applicability)). The vision says relevant available context should shape generation ([vision](../../product/vision.md)). More context improves interpretation but enlarges privacy surface, prompt cost, and stored PII.

**Options:**
- Minimal (text + language + timestamp) — cheapest, least PII, matches current pipeline. Tradeoff: ambiguous captures stay ambiguous.
- Standard (adds URL/title + surrounding paragraph) — better disambiguation and provenance; needs a retention and redaction policy.
- Rich (adds user intent, deck hint, reading session) — best personalization; most storage and prompt-injection surface to sanitize.

**Answer prompt:** Pick the payload fields and state which are stored vs sent to the LLM vs discarded. Research task: take 10 ambiguous past captures and test whether surrounding-paragraph context would have changed the module output.

## Q08. What is the capture UX contract?

**Decision:** Fire-and-forget (toast + background generation, check later) vs blocking (karte opens immediately)? And which retries exist: auto-open, whole-karte retry, per-module retry?

**Context:** Current behavior: brief feedback, recent outcomes on the dashboard, explicitly confirmed retry of one captured seite only; auto-open, whole-karte retry, and per-module retry are deferred ([scope](../../product/scope.md#explicit-deferrals)). The model treats saving and generating as distinct operations with distinct recovery ([model](../../product/model.md)).

**Options:**
- Fire-and-forget — least interruption, matches the vision's minimize-interruption principle; needs bulletproof background status and failure surfacing.
- Open-on-capture — best for users who curate immediately; interrupts reading flow and complicates middle-of-generation navigation.
- Hybrid (toast + optional open) — most flexible; two code paths to maintain and test.

**Answer prompt:** Pick the contract and the retry set for 1.0. Research task: watch three real capture sessions and note where the user looks in the 10 seconds after capturing.

## Q09. How does capture behave offline and across restarts?

**Decision:** What must survive backend-down, laptop-offline, and browser-restart: queued captures, pending saves, in-flight generation?

**Context:** Current recovery is explicit and session-bound: receipts stay local until confirmed handoff, failed saves need explicit resubmission, and generation results publish only through the originating Chrome session — reopening Chrome fails interrupted attempts ([Select and Add](../../MVP-Product-spec-select-and-add.md)). The local PostgreSQL guide documents the journal but not an offline client protocol ([local-postgresql](../local-postgresql.md)).

**Options:**
- Best-effort queue (captures + saves survive restart, generation does not) — modest work in `storage.local`, keeps session-bound generation semantics.
- Full resume (generation resumes in a new session) — needs server-side attempt ownership transfer and idempotency beyond operation receipts.
- Online-only — simplest; every offline capture is an error message. Only viable for single-machine local use.

**Answer prompt:** State the survival guarantee per artifact type. Research task: read browser `storage.local` quotas and service-worker lifetimes, then size a 100-pending-capture queue.

## Q10. How is capture authenticated and attributed?

**Decision:** Which credential authorizes a capture (session cookie, extension token, per-installation key), and how are captures from two installations of the same account distinguished?

**Context:** Installations sharing a backend see the same account today, with 7-day login sessions and 5-second view refreshes (README). There is no per-installation identity, which is why "publication still requires the originating browser session" is load-bearing for generation correctness.

**Options:**
- Shared session only — simplest; cannot tell installations apart, complicates multi-device generation ownership.
- Session + installation ID — enables per-device queues and correct cross-device status; needs an installation registry and revocation story.
- Short-lived capture tokens — best for share-sheet and hotkey clients; most token plumbing.

**Answer prompt:** Pick the credential set and state what happens when the same account captures from two browsers simultaneously. Research task: enumerate every current use of "originating session" in the generation code and list what breaks if two sessions claim one attempt.
