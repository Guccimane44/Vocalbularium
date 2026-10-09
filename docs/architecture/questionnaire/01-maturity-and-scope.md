# 01 — Maturity and scope (Q01–Q05)

These five answers constrain everything downstream. A senior architect forces them first because changing the user or the 1.0 gate later reopens auth, tenancy, hosting, and the data model all at once.

## Q01. What is the 1.0 maturity gate?

**Decision:** State the minimum bar you will call "mature": (a) reliable daily capture for one owner, (b) shareable with family or a small group, (c) public Chrome Web Store product, (d) multi-platform (web + iOS/Android), or (e) revenue-sustaining.

**Context:** Today the product is an owner-test Chrome extension with manual install and a local backend ([current scope](../../product/scope.md#current-delivery-boundary)). The vision describes a much larger system but explicitly says vision items are directions, not commitments ([vision](../../product/vision.md)). Every step from (a) to (e) multiplies operational surface: (b) needs real auth, (c) needs update channels and support, (d) needs sync, (e) needs metering and billing.

**Options:**
- (a) Single-owner reliability — smallest blast radius; keeps `admin/admin`, local-first, and manual install viable. Tradeoff: defers all multi-user design; a later switch to (b+) reopens identity and tenancy.
- (c) Public store product — forces update discipline, privacy disclosures, and support burden now. Tradeoff: slows module and semantic-object work.
- (d)/(e) Platform or business maturity — largest scope; only pick if capture demand is proven on desktop first.

**Answer prompt:** Pick one letter as the gate and name what you are explicitly deferring past 1.0. Research task: list the last five owner-reported friction points and check whether they need (a) or genuinely need (c)/(d).

## Q02. Who is the user?

**Decision:** Single owner-learner forever, invited small groups (class, team, family), or strangers on the internet?

**Context:** The model defines an account as the owner of decks and kartes, with exactly one default deck — but only `account 1` exists and there is no registration ([model](../../product/model.md), [scope](../../product/scope.md#explicit-deferrals)). The vision's multilingual, multi-subject user could be one person with many interests or many people with different needs; the architecture cannot serve both identically.

**Options:**
- Single owner — no authz matrix, no abuse controls, PostgreSQL roles stay as-is. Rework risk if wrong: entire auth and tenancy layers added later under a live schema.
- Invited groups — needs invitation codes, per-account quotas, and basic abuse limits, but no public signup hardening.
- Public strangers — needs registration, password/passkey recovery, rate limiting, spam and prompt-abuse controls, and a data-deletion story from day one.

**Answer prompt:** Name the user class and the maximum account count 1.0 must support (1, 50, 10k?). Research task: read the scope deferrals on registration and onboarding and mark each as permanent-no vs later.

## Q03. What is the flagship job-to-be-done?

**Decision:** Rank: language capture, general knowledge capture (people, places, concepts, passages), reference library, spaced memorization.

**Context:** The vision insists language learning is one application of a broader capture system, and the competitor critique rejects the word → translation → flashcard → review pipeline as the foundation ([vision](../../product/vision.md), [competitor critique](../../product/competitor-critique.md)). But the implemented catalog is five language-oriented modules and plain-text seites ([modules](../../specs/modules.md)). Whatever you rank first gets the eval budget, the module design attention, and the schema flexibility.

**Options:**
- Language-first — deepens the current five modules, pronunciation/audio, grammar; delays passage and concept modules.
- General-capture-first — forces passage inputs, summaries, timelines, and semantic-referent storage now; language modules become peers.
- Memorization-first — forces review scheduling tables and interaction logging before module breadth; risks rebuilding the flashcard-centrism the vision rejects.

**Answer prompt:** Rank the four and state which one must be excellent at 1.0 vs merely possible. Research task: collect 20 real captures from the owner and tag each with the job it served.

## Q04. What stays out even at maturity?

**Decision:** Name 3–5 things Vocabularium will not become (e.g. AI tutor, OCR scanner, CEFR tester, social feed, generic chatbot wrapper).

**Context:** The critique's core warning is feature accumulation: many competitors bolt on stories, tutors, maps, and tests until no one can say what the product is uniquely excellent at ([competitor critique](../../product/competitor-critique.md), section on generic AI wrappers). The vision agrees: breadth is only valuable when each module deepens capture ([vision](../../product/vision.md)). Without a no-list, every future request becomes scope.

**Options:**
- Hard no-list now (e.g. no social, no OCR, no CEFR) — cheapest; lets module proposals be rejected in one sentence.
- Soft parking lot — everything deferred stays "maybe later"; keeps optionality but invites repeated debate.
- No list — fastest now, most expensive later; each addition re-litigates product identity.

**Answer prompt:** Write the no-list with one-line reasons tied to vision principles. Research task: go through the scope deferrals and mark each as 1.0-candidate, later, or never.

## Q05. How do vision possibilities become scope?

**Decision:** What turns a vision "possibility" (mobile capture, source context, new modules, deck moves, rich media) into an implementation requirement?

**Context:** Vision items are explicitly not commitments, and scope items change only on explicit owner decision ([vision](../../product/vision.md), [scope](../../product/scope.md)). Today that gate is informal. At maturity, with more contributors and user requests, "someone thought it was a good idea" will otherwise become scope by accident.

**Options:**
- Owner-decision gate — every scope change needs a recorded decision with approval source and date (matches the project workflow). Slow but traceable.
- Lightweight proposal (module spec + eval sample) — faster for module additions; risks inconsistent quality bars.
- No gate — fastest, but the no-list from Q04 becomes unenforceable.

**Answer prompt:** Pick the gate and who operates it. Research task: read `docs/guides/project-workflow.md` and decide whether it already describes this gate or needs a scope-change section.
