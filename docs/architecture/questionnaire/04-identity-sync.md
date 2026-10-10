# 04 — Identity and sync (Q17–Q21)

If Q02 chose more than one human, this section is load-bearing. Identity mistakes are the hardest to migrate: changing the account model later touches every row, receipt, and session.

## Q17. What is the account model?

**Decision:** Single built-in owner account forever, or real multi-user accounts? If multi-user: password, passkey, OAuth — and what does signup create?

**Context:** Today there is exactly one account with `admin`/`admin` login, 7-day sessions, and a seeded empty My Deck; multi-user registration and onboarding are deferred ([scope](../../product/scope.md#explicit-deferrals), README). The persistence layer hard-codes an owner account ID of 1 — this is not multi-tenant authorization ([local-postgresql](../local-postgresql.md)).

**Options:**
- Single account forever — no auth work; viable only if Q02 stayed single-owner. Any later multi-user need becomes a full rewrite of authz.
- Local multi-account (username + password, argon2/scrypt) — self-hostable, no external dependency; you own recovery, lockout, and session security.
- External identity (OAuth/passkey) — less password plumbing; adds provider dependency and account-linking edge cases.

**Answer prompt:** Pick the model and describe the first-run story (seed data? sample pages? onboarding deck?). Research task: list every query that assumes `account_id = 1` and estimate the migration to parameterized accounts.

## Q18. What is the sync topology?

**Decision:** (a) local-first single backend, (b) one hosted backend with many clients, (c) local + cloud with conflict resolution, or (d) fully local with no server?

**Context:** Installations sharing a backend see the same account today, with explicit recovery on save/sync failure ([scope](../../product/scope.md)). The local guide keeps the old SQLite/Render installation strictly separate with no automatic import ([local-postgresql](../local-postgresql.md)).

**Options:**
- (a) Local-first — matches today; data lives where the user runs Postgres. Tradeoff: multi-device sync is manual backup/restore.
- (b) Hosted hub — natural multi-device; you operate Postgres, backups, TLS, and uptime.
- (c) Local + cloud sync — best UX and hardest build: needs op logs, vector clocks or CRDTs, and a merge UI.
- (d) Serverless-local (extension storage only) — kills the backend entirely; caps scale and generation orchestration.

**Answer prompt:** Pick one and state where the source of truth lives when the laptop is offline. Research task: sketch the message flow for a capture made on phone with laptop closed for each option.

## Q19. What are the sync and conflict semantics?

**Decision:** Last-write-wins with explicit recovery (today), version vectors + merge UI, or CRDTs? Cover the three conflict cases: page-vs-page edit, configuration-change-vs-page-edit, and removing a content module instance whose components hold content.

**Context:** All mutations run through one ordered per-account executor with repeatable-read snapshots today, so conflicts are serialized away — at the cost of single-process scale ([local-postgresql](../local-postgresql.md)). Operation receipts are idempotent by SHA-256 fingerprint with same-ID-different-payload rejected. Save-during-generation is rejected, not queued, requiring explicit resubmission.

**Options:**
- Keep serialized executor + explicit resubmission — simplest correct behavior; concurrent editors take turns or retry by hand.
- Optimistic with merge UI — smoother collaboration; needs per-component versioning and a configuration-vs-content merge policy.
- CRDT/OT — automatic merges; heavy to build correctly and to eval (order, intention preservation, test-difficulty).

**Answer prompt:** Pick the semantics and write the rule for each of the three conflict cases, especially: when may content be deleted without confirmation? Research task: list which operations replace content and which already require confirmation (since 0.4.0, configuration changes never rewrite pages; component and page Retry always confirm).

## Q20. Are there shared or public decks?

**Decision:** Private-everything, shared decks with collaborators, or public read-only decks/links?

**Context:** Every page belongs to exactly one deck and decks are the organizing foundation ([model](../../product/model.md)); moving/copying between decks is deferred ([scope](../../product/scope.md)). Nothing in the current authz distinguishes reader from owner.

**Options:**
- Private only — no sharing code at all; state it explicitly to close the question.
- Collaborator sharing — needs roles (viewer/editor), invitation, and per-share revocation.
- Public links — needs unguessable tokens, scrape protection, and a generation-cost policy (do viewers trigger paid generation?).

**Answer prompt:** Pick one and, if sharing exists, define roles and revocation. Research task: check whether operation receipts or generation journals would leak across accounts under shared tables.

## Q21. How do sessions and devices work?

**Decision:** Session lifetime, concurrent-device policy, logout-all, and what happens to pending work on logout or profile switch?

**Context:** Login sessions last 7 days with active-view refresh; logout removes account views and capture; appearance preference is per-installation, not per-account ([MVP scope](../../history/mvp/MVP-Product-scope.md), README). Extension reload ends that installation's generation session.

**Options:**
- Long-lived multi-device sessions — convenient; needs device list + remote revoke + per-device pending queues.
- Single-active-session — simplest security; kills legitimate two-browser workflows the MVP explicitly supported.
- Short-lived + refresh rotation — best practice; most token plumbing and expiry UX.

**Answer prompt:** Set lifetimes and the logout/revoke semantics. Research task: list everything that must be cleared on logout (sessions, cached account, receipts, drafts) and verify each is cleared today.
