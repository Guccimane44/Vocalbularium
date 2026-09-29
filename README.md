# Vocabularium

A vocabulary capture extension for Chrome. The v0.3.0 local candidate uses Fastify, PostgreSQL 18, WXT and React for the dashboard, configuration and karte editor. Account access, capture, deck configuration and karte workflows remain available. The earlier Render/OpenCode MVP is a separate testing environment. The owner accepted that MVP baseline on 13 September 2026; see the [Windows acceptance record](docs/history/evidence/windows-owner-acceptance-2026-09-13.md).

- [MVP delivery tracker and milestone issues](https://github.com/Guccimane44/Vocalbularium/issues/5)
- [Implementation plan](docs/history/mvp/MVP-Implementation-plan.md)
- [Foundation decisions and verification](docs/history/mvp/M0-Foundation.md)
- [Windows installation](docs/guides/windows-install.md) and [delivery preparation](docs/history/mvp/M6-Delivery.md)
- [MVP scope](docs/history/mvp/MVP-Product-scope.md)

The [terminology migration](docs/plans/v0.3.0-plus-terminology-migration.md) establishes deck → karte → seite. Previous extension builds, saved links and recoverable operations remain supported by the [compatibility policy](docs/architecture/terminology-compatibility.md); install the updated backend and its reviewed migration before the new extension.

## Account and dashboard

Install Node.js 24 and start PostgreSQL 18 on loopback using the [local setup instructions](docs/architecture/local-postgresql.md), then run from the repository root:

```sh
npm ci
npm run db:setup
npm start
```

Build the extension with `npm run build`, then load `artifacts/extension` through `chrome://extensions` → Developer mode → **Load unpacked**. Click the extension button and sign in with username `admin` and password `admin`.

The account server listens on `127.0.0.1:4318` and persists data in the local `vocabularium_dev` PostgreSQL database. Both extension installations use the same account when pointed at this server. Use a separate Chrome profile for this fresh account. Select text on a webpage and choose **Create a karte in “My Deck”** (or the current default deck name). Recent outcomes appear on the dashboard; open a karte to navigate its plain-text seites. Use **Add new deck** or a deck’s **••• → Configure deck** menu to edit its seites and modules. Open a karte to edit its seites or retry a captured seite; use **Add karte manually** in a deck for a blank karte.

Build an installable extension folder with:

```sh
npm run build
```

WXT writes the Chrome Manifest V3 build to `artifacts/extension`. For a hosted backend, set `VOCABULARIUM_API_URL` to its HTTPS origin when building; the build writes the matching extension host permission. No credentials are embedded in the package. The generated manifest is checked against the source identity and permissions during the build.

The previous [Render testing procedure](docs/history/mvp/M6-Delivery.md#render-free-deployment) describes the historical SQLite deployment. v0.3.0 does not deploy this branch or import that account. Preserve existing SQLite files and old extension profiles; see the [PostgreSQL cutover policy](docs/architecture/local-postgresql.md#keep-the-old-installation-separate).

The local API uses Fastify and validates its startup settings. `npm run db:setup` writes ignored `.env.postgres` with separate application, migration, and test connections. Set provider options, `HOST` (loopback only), `PORT`, `DATA_DIR` (generation journal), and `LOG_LEVEL` in `.env`. `GENERATION_MAX_ACTIVE` and `GENERATION_MAX_QUEUED` bound active and waiting seite attempts (defaults: 4 and 16). Login sessions last seven days; active views refresh every five seconds. `GET /health/live` checks process liveness; `GET /health/ready` and the compatible `GET /health` check database readiness and API ownership. The [OpenAPI JSON reference](docs/api/openapi.json) is generated with `npm run openapi` without a database connection.

Use `npm run db:generate` to prepare reviewed schema changes and `npm run db:migrate` with the API stopped to apply them. Normal API requests use the restricted application role. [Backup/restore commands and ordering/recovery details](docs/architecture/local-postgresql.md) explain the one-process limit and durable journal requirement.

## Deck configuration

Deck drafts support all five modules, repeated instances, one to four seites, and word/sentence sample previews. Save applies the layout to existing kartes: new seites are empty, retained seites keep their text, and removing saved content requires confirmation against the latest account data. Deleting the default deck requires a replacement; deleting the sole deck creates a fresh empty My Deck.

See [deck verification evidence](docs/history/mvp/M3-Decks.md).

## Karte workflows

The karte list loads up to 30 kartes at a time in any of four sort orders. Alphabetical sorting uses Unicode NFKC normalization and lowercase text, followed by JavaScript code-unit order; ties use the stable karte ID. Empty front seites sort using empty text, and displayed indices are calculated from the loaded list. Decks load in pages of 40; karte and deck detail is fetched when opened.

Manual drafts remain intact when switching seites. **Save** writes all changed seites together; **Cancel** discards the editing session. Leaving the editor offers Save, Discard, or Continue editing. Failed saves retain their drafts and offer **Try saving again**. Only captured kartes offer current-seite **Retry**, with the required replacement warning. See [karte workflow verification](docs/history/mvp/M4-Cards.md).

## Generation

Copy `.env.example` to the ignored `.env` file (or add its generation settings to your existing file), configure `OPENCODE_API_KEY` with your OpenCode Go key, then restart the account server. Keep the key on the server. The extension never receives it. The default is `deepseek-v4.1-flash` through `https://opencode.ai/zen/go/v1/chat/completions`; `OPENCODE_MODEL` can override the model. Requests never fall back to another model automatically.

The adapter requests JSON in its instructions and validates the completion status, object fields, input classification, and nonempty text locally before publishing. It does not depend on undocumented provider support for strict structured outputs. Each request has a 60-second limit and a 4,096-token output budget. Requests identify this app as `Vocabularium/0.3.0` and use one stable conversation ID per karte, including seite retries. [OpenCode Go](https://opencode.ai/docs/go/) is a subscription service intended for coding-agent traffic; the app's live requests succeeded with the owner's key on 12 September 2026. Keep its console **Use balance** option off to stop at the subscription limit instead of drawing from Zen credits. The app does not change that account setting.

Without a key, the original capture is still saved. Seites requiring interpretation or generation fail visibly; exact-selection seites still complete. Automated checks inject controlled provider responses and do not spend API credits. The live word/sentence smoke passed with the configured Go key; see the [recorded provider samples](docs/history/evidence/deepseek-v4.1-flash-smoke-2026-09-12.json) and [hosted word/phrase/sentence results](docs/history/evidence/render-smoke-2026-09-12.json).

Capture receipts remain local through confirmed handoff to server kartes; pending receipts and saves remain available for explicit recovery. **Try saving again** resubmits the existing operation. Generation results are published only through their originating Chrome session; reopening Chrome fails its interrupted attempts. See [capture implementation evidence](docs/history/mvp/M2-Capture.md) and the authoritative [Select and Add rules](docs/MVP-Product-spec-select-and-add.md).

## Local foundation prototype

The historical M0 laboratory remains covered by PostgreSQL-backed browser fixtures. Manual use of `npm run prototype` requires an explicitly provisioned disposable database in `PROTOTYPE_DATABASE_URL`. It listens on `127.0.0.1:4317` and generates illustrative output; do not point it at the development account or deploy it as the product backend.

## Acceptance status

The [v0.3.0 migration plan](docs/history/v0.3.0-migration-plan.md) tracks the local candidate and owner acceptance separately from the historical hosted MVP. Stage 6 [bounded-read evidence](docs/history/evidence/v0.3.0-stage6-bounded-reads.md) and [local PostgreSQL instructions](docs/architecture/local-postgresql.md) cover current automated checks and setup. Earlier Windows acceptance applies to the earlier delivered packages, not this local candidate.

The [acceptance record](docs/history/mvp/M5-Acceptance.md) maps all eleven criteria to automated, hosted, and owner-reported evidence. The owner confirmed Windows and the remaining M5 checks passed, explicitly deferring stale-client recovery after a Render reset to [issue #24](https://github.com/Guccimane44/Vocalbularium/issues/24). That scenario is untested. Render Free does not satisfy durable hosted persistence. `npm run smoke:generation` records a small live integration sample; the [hosted smoke commands](docs/history/mvp/M6-Delivery.md#hosted-verification) exercise the deployed backend explicitly.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Browser checks use temporary isolated profiles and their own servers on ports 4317 and 4318; stop manual servers first. The tests create and remove uniquely named PostgreSQL databases using `.env.postgres` or `TEST_DATABASE_ADMIN_URL`; they reject the development database as a reset target. Linux machines may need `npx playwright install --with-deps chromium`.

For updates, pull the working branch, run `npm ci`, apply reviewed migrations with the API stopped, restart the API, then reload the unpacked extension and open dashboard tabs. Extension reload ends that installation's generation session; review interrupted seites using the [Select and Add rules](docs/MVP-Product-spec-select-and-add.md). Follow the linked installation/update instructions for the product extension.
