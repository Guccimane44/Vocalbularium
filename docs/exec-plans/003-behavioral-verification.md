# 003 — Characterize behavior at the real boundaries

Version: 1 | Status: Planned | Owner: Assign at execution
Baseline: `a958e4d36cf791b87d15ca60cd4d48e2c43d540a` (record new start SHA)
Depends on: 001,002

## Purpose and preservation contract

Expand evidence from domain tests to ordered migrations, actual Worker requests,
browser durability and client replay. Protect B01–B14 without fixing D01–D03 inside
the harness change. Current unintended outcomes receive precise characterization
tests and explicit debt records, not permanent product acceptance requirements.

## Allowed scope and prerequisites

Tests, fixtures, test-only launch/configuration, package test scripts and narrowly
justified test dependencies with locked versions; supporting evidence docs.
Preserve app/UI/domain/API source by default. Prefer exercising the existing
Worker over extracting its handler for tests. If a seam is unavoidable, document
the smallest behavior-neutral change and review it separately before proceeding.
Use 002 disposable state. Do not add a production test-login endpoint.

## Execution steps

1. **Migration harness.** Replace the helper's single-file assumption with all
   committed migrations in recorded order. Check SQL files/journal consistency,
   fail on missing/duplicate/out-of-order entries. Apply to empty SQLite and local
   D1; rerun safely. Preserve seeded records through upgrades. With only 0000 at
   baseline, test runner evolution using a temporary synthetic next migration;
   do not commit a fake production migration to exercise the harness.
2. **HTTP/D1 lane.** Add **proposed** `npm run test:integration` that starts the
   actual local Worker through the pinned tooling and applies migrations to an
   owned fresh database. Authenticate through the local preview/plugin path or a
   test-only seeded hashed session; explicitly verify production cannot enable
   that fixture path. Block unexpected external network requests.
3. **HTTP contracts.** Verify unauthenticated/owner isolation, cookie attributes,
   bearer sessions, Origin rejection/allowed native path, streamed and declared
   request size bounds, malformed JSON/schema errors, no-store headers, cursor
   unchanged response, mutation receipts, export excluding receipts, logout and
   tombstone deletion. Cover the trusted preview-header boundary as a hosting
   assumption; a local crafted header alone is not proof of production trust.
4. **Browser lane.** Add **proposed** `npm run test:browser`, extending the pinned
   profile harness established in 002 for this Vite/Worker stack. Test isolated real browser contexts,
   deterministic fixture accounts, semantic selectors and condition-based waits.
   Poll job completion with a deadline; do not make tests depend on live AI or
   arbitrary sleeps. Record browser version, runner, trace and redacted failure
   screenshot locations in the plan, not binary user state in Git.
5. **Durability and failure lanes.** Use exact scenarios below for restart/offline,
   account switching, deletion and retries. Run production browser shell tests
   against built artifacts, since the service worker is registered only there.
   Native and real installed-extension evidence stays distinct from mocks.
6. **Domain/provider gaps.** Add fixed-clock rating sequences for all four grades,
   new/day limits, due ordering and UTC/DST boundaries. Add deterministic malformed
   output, linguistic-check rejection, repair success/exhaustion, timeout/refusal
   and partial-page usage/settlement fixtures using the existing provider seam.
7. Update B01–B14 with exact test names/commands and D01–D03 with reproducible
   outcomes. Open stable-ID narrow defect plans for fixes, including compatibility
   with persisted queues/receipts. No anonymous skips, blanket expected failures,
   snapshot updates without review, or weakened assertions to obtain green.

## Required scenario matrix

| Scenario | Expected preserved outcome / evidence |
| --- | --- |
| Empty account→explicit EN/DE list→capture `bank` | Three aligned meanings per language, two successful-page charges, one lexical card. Do not confuse one capture with the six-charge onboarding sample flow. |
| Optional hidden/after pages; Examples disabled/original/translated/both | Hidden pages stay hidden in review; after pages appear only after reveal. Enabled example policy renders the correct original/translation pairing per meaning. |
| Edit list→new capture; existing card→explicit regeneration | New captures snapshot new configuration; existing cards retain theirs until regeneration. Successful replacement updates the current page; frozen attempts and schedule survive. |
| Change interesting languages independently of answer languages | Alternative-language tags follow interests; answer-page selection and allowance do not change merely from tagging interests. |
| Reveal→Good→reload | No answer before reveal; one frozen Essential reference and one schedule transition; no generation charge for review. |
| Duplicate request/lost acknowledgement | Same ID/exact payload returns original result; no duplicate occurrence/charge/review. Changed payload rejects. |
| Partial page failure→retry; deletion during generation | Successful sibling survives, only successes charged, unused reservation released, deleted card/account never resurrected. |
| Empty→migrated DB→reopen; two real D1 request clients | Canonical owner state persists; CAS conservation/concurrency holds beyond synchronous SQLite approximation. |
| Production offline reload with prepared review | Shell and saved account state available; reveal/rating retained for sync; API/RSC/auth responses absent from cache. Assert cache inventory as well as UI. |
| Account A queued work→logout/expiry→account B; two tabs | B cannot see/upload A's work; late A requests cannot republish A into B. Distinguish secure lock from network-offline fallback. |
| D01 reverse-sorting UUID queue after offline restart | Reproduce precise dependency error and retained data using actual IndexedDB; record current outcome separately from desired causal upload. |
| D02 reordered JSON keys | Exact logical data reordered produces the recorded conflict at baseline. Include nested objects and native encoding when available; changed-data rejection still holds. |
| D03 Chrome HTTP 429/500→success | Simulation demonstrates current persistent-error behavior; network throw and 401 differ. Real unpacked profile/restart remains separately labeled evidence. |
| Native prepared review/share outbox | On a capable machine, compile app and share target, decode shared protocol fixtures and exercise atomic save/restart/upload. Without full Xcode, record unverified; parser success is insufficient. |

## Baseline defect disposition

The foundation gate measures faithful, repeatable characterization. Maintain a
separate **proposed** `npm run test:acceptance` report for desired product outcomes.
If a scenario exposes another baseline defect, assign a new D ID with an exact
reproducer, owner and narrow follow-up plan. Assert the precise current outcome
in characterization; retain the desired assertion as a failing acceptance check,
with the D ID in its report. This is an explicit contract split reviewed by an
independent reviewer, never a broad expected-failure catch or silent weakening.

Plan 003 can close once all required scenarios run deterministically and each
failed desired outcome has that disposition. An unexplained failure, missing
reproducer, lost data with no captured evidence, or a test that accepts arbitrary
errors blocks closure. New behavior regressions after the recorded baseline
fail characterization. Fixing a D item later updates both suites and its plan;
do not retain obsolete defect expectations. Product acceptance remains failed
until the desired outcomes pass; foundation completion must report this clearly.

## Validation and acceptance

- Existing 31 tests remain passing, with any deliberate replacement mapped to an
  equally strong contract assertion. New tests fail on a targeted violation of
  their protected behavior in a disposable copy; avoid implementation-mirroring.
- `npm run verify:fast`, `npm run test:integration`, `npm run test:browser`, and
  `npm run build` (proposed interfaces from this plan/001) pass in fresh isolated
  runs. Production-shell lane must exercise the built Worker, not a dev server.
- Empty/repeated migrations pass on local D1; temporary migration-evolution test
  proves the harness does not silently skip later migrations or erase seed rows.
- Run the new stateful suites twice from clean run directories and concurrently
  in two instances once to demonstrate determinism/isolation. Broaden repetition
  only if failures or timing concerns justify it; never retry away flakes.
- Every D record has a named characterization test or a precise blocked
  reproducer with owner/next action; D01–D03 browser/domain/Chrome simulations are
  required, native SDK-specific impact may remain externally unverified.
- Offline and account-switch core browser scenarios must execute in the actual
  harness; they cannot be waived as “manual.” Any failed desired invariant follows
  the disposition above and remains visibly unmet. Real-device/installed Chrome
  capture/live-service evidence remains a release track.
- Independent reviewer verifies that the harness has not changed product behavior
  or converted a suspected defect into an intended acceptance rule.

## Risks and rollback

Clock, IDs, network and browser lifecycle cause false confidence if only mocked;
control test inputs while retaining actual state/HTTP boundaries. Provider mocks
establish protocol/settlement, not linguistic quality. Revert harness/scripts and
new test dependencies to roll back; dispose only owned test state. No production
migration, secret or saved user data changes are authorized here.

## Decisions and independent review

Accepted F03/F04 and independent scheduling/provider challenges. Actual HTTP and
browser boundaries precede structural extraction. Fingerprint repair must account
for legacy receipt compatibility; outbox repair must retain queued records.
Independent execution review: pending.

## Execution record

- Starting commit/environment: pending.
- Commands/results/evidence: pending.
- Deviations and open issues: D01–D03 owned by this plan's executor until transferred;
  full native/live acceptance explicitly external.
- Completion/remaining work: not started.
