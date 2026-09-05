# Repository map

Baseline: `a958e4d36cf791b87d15ca60cd4d48e2c43d540a`, audited 2026-09-05.

## Authority and navigation

The current user task defines the authorized change. The [product specification](../product-spec.md)
and [UI guidelines](../ui-guidelines.md) describe intended product behavior. Source
plus dated verification establishes implemented behavior; neither an old prompt
nor a passing unit test overrides a discrepancy. Record differences in the
[behavior ledger](behavior-ledger.md), then handle changes explicitly.

[Architecture](../architecture.md) describes the current design;
[implementation status](../implementation-status.md) records earlier delivery
evidence and external acceptance gaps. [Service setup](../service-setup.md) is the
integration runbook. [MVP setup](../mvp-setup.md) and the
[original prompt](../../prompts/initial-build-prompt.md) are historical context.
Do not infer new work from an old instruction to complete or publish the MVP.

[AGENTS.md](../../AGENTS.md) is the task entry point. The
[plan index](../exec-plans/README.md) controls migration scope and sequencing.

## Code and data flow

| Surface | Entry points | Responsibility and boundary |
| --- | --- | --- |
| Root tooling | `package.json`, `scripts/stage-site.mjs` | Delegates to web; build copies web Worker/client output and SQL migrations to root `dist`. |
| Web UI | `apps/web/app/page.tsx`, `layout.tsx`, `globals.css` | Sign-in, list configuration, capture/search, answer pages, review, settings. Main page is 1,639 lines at baseline; size alone is not a refactor mandate. |
| Browser state | `apps/web/lib/client.ts`, `apps/web/public/sw.js` | Account-owned IndexedDB snapshots/outbox; foreground sync; production shell cache. Client imports domain intentionally. |
| HTTP adapter | `apps/web/app/api/[...path]/route.ts` | Cloudflare bindings, request validation, cookies/bearer auth, snapshots, mutations, jobs, export/deletion. Test this through the actual Worker. |
| Domain | `apps/web/lib/domain.ts` | Shared types/schemas, pure mutation interpreter, quota, FSRS, frozen reviews, content validation. No provider/network I/O. |
| Persistence | `apps/web/lib/store.ts`, `db/schema.ts`, `drizzle/` | D1 account JSON aggregate, compare-and-swap, sessions/challenges/rate limits. Twelve CAS attempts; 1.8 MB aggregate limit. |
| Authentication | `apps/web/lib/auth.ts` | Hashed sessions, email codes, Apple token validation, independent identity namespaces. |
| Generation | `apps/web/lib/generation.ts`, `fixtures.ts`, `languages.ts` | Fixture/live adapters, meaning/page checks, repairs, leases, usage, per-page settlement. Preview jobs use fixtures. |
| UI primitives | `apps/web/components/ui/`, `hooks/use-mobile.ts` | Existing component catalog. Do not prune or reformat it as migration cleanup. |
| Chrome | `apps/chrome/manifest.json`, `background.js`, `popup.js` | Unbundled Manifest V3 capture; per-profile local storage and alarms; native bearer API client. |
| iOS | `apps/ios/project.yml`, `App/`, `Shared/Models.swift`, `ShareExtension/` | XcodeGen targets, SwiftUI library, Keychain sessions, App Group file outbox. Parser verification only. |
| Tests | `apps/web/tests/*.test.ts`, `helpers.ts` | Node test runner, SQLite D1 approximation, mocked provider/email and Chrome APIs. |
| Runtime/build | `apps/web/vite.config.ts`, `wrangler.local.json`, two `.openai/hosting.json` files | Vinext + Vite + Cloudflare Worker/D1 + Sites. `next.config.ts` is compatibility configuration, not evidence of a conventional Next server. |

Browser and native clients send a stable mutation envelope to the HTTP adapter.
Authentication resolves the owner; Store reads/replays the domain change and
commits by revision. Generation runs outside replayable callbacks, claims a D1
lease, validates pages, and publishes through further atomic changes. Clients
receive full snapshots on changed revisions; local storage is a cache/outbox.

The root and web manifests identify **one shared remote Site**. Matching manifests
are checked by staging. Neither a branch nor a worktree creates a separate hosted
database, secret store, access policy, or deployment.

## Commands available now

| Command from root | What it establishes | Important limit |
| --- | --- | --- |
| `npm run setup` | `npm ci` using `apps/web/package-lock.json` | Node is only bounded below; npm/runtime not pinned. |
| `npm --prefix apps/web run db:migrate` | Local Wrangler D1 migrations | Mutates that checkout's local database; use a disposable checkout for audit/reset. |
| `npm run dev` | Vinext development server with local preview integration | Development identity and behavior do not certify production offline shell. |
| `npm test` | 31 existing Node tests at baseline | No actual HTTP/browser/iOS suite. |
| `npm run typecheck` | Web TypeScript | Not Swift SDK compilation or extension runtime verification. |
| `npm run build` | Worker/client build, matching-manifest staging | Replaces generated root `dist`; does not deploy or test hosted connectivity. |
| `npm --prefix apps/web run lint` | Existing Oxlint rules | Fails at baseline; see audit. |
| `npm --prefix apps/web run format -- --check` | Read-only formatter check | Prefer bounded paths for reproducible scope; omit `--check` only for deliberate formatting work. |
| `node --check apps/chrome/background.js` (also popup and `apps/web/public/sw.js`) | JavaScript syntax | Does not exercise browser APIs. |
| `swiftc -frontend -parse` with the four tracked Swift paths | Swift syntax | Does not establish SDK type checking, signing, or runnable targets. |

## Change-to-check routing

| Proposed change | Minimum relevant evidence before merge |
| --- | --- |
| Documentation/plans | Relative links, required plan sections, source claim review, diff scope. |
| Tooling/CI/environment | Clean-checkout setup/test/typecheck/build, command failure propagation, no state leakage. |
| Domain/store/schema | Domain suite plus ordered-migration and real local D1 tests once plan 003 lands. |
| HTTP/auth/generation | API integration and deterministic provider/auth fixtures; external checks remain separate. |
| Browser state/UI/worker | Browser journeys, reload/offline/account switching; production artifact for service-worker tests. |
| Chrome | Worker simulations, syntax, real installed-extension scenarios when claiming runtime support. |
| iOS | Swift parse plus full Xcode compile/tests on a capable machine; explicit unavailable status otherwise. |

Before the new harness exists, its absence is a limitation to resolve before
changing the affected behavior. It is not permission to claim those checks passed.
