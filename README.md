# Vocabularium

Capture a word, explore its meanings in your chosen languages, and remember it with spaced repetition.

Repository: [Guccimane44/Vocalbularium](https://github.com/Guccimane44/Vocalbularium) · **private**. The repository spelling is intentional; the product remains Vocabularium.

## Run the browser MVP locally

Requires Node.js 22.13 or later.

```sh
npm run setup
npm --prefix apps/web run db:migrate
npm run dev
```

Open the local address printed by the server. Choose **Sign in to the private preview**, then **Open private preview**. Local preview identity is supplied by the Sites development plugin; it is excluded from production builds.

Create a wordlist and explicitly choose its answer languages, or choose **Explore samples in English + German**. Sample expressions are `bank`, `serendipity`, `apprendre`, `光`, `كتاب`, and `Gift`. Sample answers are available in English, German, and French. Other words remain saved with an honest unsupported status until live AI is configured.

## Implemented

- Browser wordlists, per-language Explanation/Examples settings, capture, search, separate answer pages, self-rated review, interests, quota, export, and deletion.
- D1 persistence with account ownership and atomic compare-and-swap changes. Durable generation jobs, leases, page-level quota settlement, partial failure recovery, and deletion protection.
- One pinned FSRS schedule per word; frozen Essential-language attempts, exact retry idempotency, retained concurrent observations, and a single canonical scheduling transition.
- Browser account-scoped IndexedDB snapshots/outboxes, automatic foreground sync, and a production offline-shell worker.
- Email-code and Apple identity-token authentication adapters, plus a clearly separate private-preview identity path.
- OpenAI Responses generation adapter with structural and model-assisted linguistic checks, bounded repairs, and usage records. No provider key is exposed to clients.
- Chrome selection/paste extension with durable storage and restart-safe upload retries.
- SwiftUI iOS source and a share extension using an App Group outbox and Keychain sessions.

**This is a working implementation milestone, not a claim that the full production MVP is complete.** Live email, Apple, and AI services are not configured. The iOS app has not been compiled or run on a device because full Xcode is unavailable. See [implementation status](docs/implementation-status.md) for verification evidence and remaining acceptance work.

## Validate and build

```sh
npm test
npm run typecheck
npm run build
```

The root build stages the browser Worker and database migrations into `dist/` for private Sites deployment. Both hosting manifests reference the same registered Site. The GitHub repository contains the whole monorepo.

## Project layout

| Location | Purpose |
| --- | --- |
| `apps/web` | Browser interface, API routes, domain logic, database schema, fixtures, tests |
| `apps/chrome` | Unpacked Manifest V3 capture extension |
| `apps/ios` | SwiftUI app, share extension, shared durable storage, XcodeGen project |
| `docs` | Product specification, architecture, service setup, delivery evidence |
| `prompts` | Original implementation brief |

## Documentation

- [Agent-first migration audit](docs/agent-first/audit.md)
- [Versioned execution plans](docs/exec-plans/README.md)
- [Repository map and verification scope](docs/agent-first/repository-map.md)
- [Product specification](docs/product-spec.md)
- [UI guidelines](docs/ui-guidelines.md)
- [Architecture and sync contract](docs/architecture.md)
- [Service setup](docs/service-setup.md)
- [Implementation status](docs/implementation-status.md)
- [Chrome setup](apps/chrome/README.md)
- [iOS setup](apps/ios/README.md)
