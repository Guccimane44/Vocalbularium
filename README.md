# Vocabularium

A vocabulary capture extension for Chrome. This branch continues the approved v0.3.0 local architecture migration with Fastify, PostgreSQL 18, and a WXT extension build. React now renders the dashboard and deck card lists; the card and configuration editors follow in the next Stage 5 changes. Account access, capture, deck configuration, and card workflows remain available. The earlier Render/OpenCode MVP is a separate testing environment. The owner accepted the MVP baseline on 13 September 2026; see the [Windows acceptance record](docs/evidence/windows-owner-acceptance-2026-09-13.md).

- [MVP delivery tracker and milestone issues](https://github.com/Guccimane44/Vocalbularium/issues/5)
- [Implementation plan](docs/MVP-Implementation-plan.md)
- [Foundation decisions and verification](docs/M0-Foundation.md)
- [Windows installation](docs/Windows-Install.md) and [delivery preparation](docs/M6-Delivery.md)
- [MVP scope](docs/MVP-Product-scope.md)

## Account and dashboard

Install Node.js 24 and start PostgreSQL 18 on loopback using the [local setup instructions](docs/architecture/local-postgresql.md), then run from the repository root:

```sh
npm ci
npm run db:setup
npm start
```

Build the extension with `npm run build`, then load `artifacts/extension` through `chrome://extensions` → Developer mode → **Load unpacked**. Click the extension button and sign in with username `admin` and password `admin`.

The account server listens on `127.0.0.1:4318` and persists data in the local `vocabularium_dev` PostgreSQL database. Both extension installations use the same account when pointed at this server. Use a separate Chrome profile for this fresh account. Select text on a webpage and choose **Create a card in “My Deck”** (or the current default deck name). Recent outcomes appear on the dashboard; open a card to navigate its plain-text pages. Use **Add new deck** or a deck’s **••• → Configure deck** menu to edit its pages and modules. Open a card to edit its pages or retry a captured page; use **Add card manually** in a deck for a blank card.

Build an installable extension folder with:

```sh
npm run build
```

WXT writes the Chrome Manifest V3 build to `artifacts/extension`. For a hosted backend, set `VOCABULARIUM_API_URL` to its HTTPS origin when building; the build writes the matching extension host permission. No credentials are embedded in the package. The generated manifest is checked against the source identity and permissions during the build.

The previous [Render testing procedure](docs/M6-Delivery.md#render-free-deployment) describes the historical SQLite deployment. Stage 4 does not deploy this branch or import that account. Preserve existing SQLite files and old extension profiles; see the [PostgreSQL cutover policy](docs/architecture/local-postgresql.md#keep-the-old-installation-separate).

The local API uses Fastify and validates its startup settings. `npm run db:setup` writes ignored `.env.postgres` with separate application, migration, and test connections. Set provider options, `HOST` (loopback only), `PORT`, `DATA_DIR` (generation journal), and `LOG_LEVEL` in `.env`. Login sessions last seven days; active views refresh every five seconds. `GET /health/live` checks process liveness; `GET /health/ready` and the compatible `GET /health` check database readiness and API ownership. The [OpenAPI JSON reference](docs/api/openapi.json) is generated with `npm run openapi` without a database connection.

Use `npm run db:generate` to prepare reviewed schema changes and `npm run db:migrate` with the API stopped to apply them. Normal API requests use the restricted application role. [Backup/restore commands and ordering/recovery details](docs/architecture/local-postgresql.md) explain the one-process limit and durable journal requirement.

## Deck configuration

Deck drafts support all five modules, repeated instances, one to four pages, and word/sentence sample previews. Save applies the layout to existing cards: new pages are empty, retained pages keep their text, and removing saved content requires confirmation against the latest account data. Deleting the default deck requires a replacement; deleting the sole deck creates a fresh empty My Deck.

See [deck verification evidence](docs/M3-Decks.md).

## Card workflows

The card list supports four sort orders. Alphabetical sorting uses Unicode NFKC normalization and lowercase text, followed by JavaScript code-unit order; ties use the stable card ID. Empty front pages sort using empty text, and displayed indices are calculated from the current list.

Manual drafts remain intact when switching pages. **Save** writes all changed pages together; **Cancel** discards the editing session. Leaving the editor offers Save, Discard, or Continue editing. Failed saves retain their drafts and offer **Try saving again**. Only captured cards offer current-page **Retry**, with the required replacement warning. See [card workflow verification](docs/M4-Cards.md).

## Generation

Copy `.env.example` to the ignored `.env` file (or add its generation settings to your existing file), configure `OPENCODE_API_KEY` with your OpenCode Go key, then restart the account server. Keep the key on the server. The extension never receives it. The default is `deepseek-v4.1-flash` through `https://opencode.ai/zen/go/v1/chat/completions`; `OPENCODE_MODEL` can override the model. Requests never fall back to another model automatically.

The adapter requests JSON in its instructions and validates the completion status, object fields, input classification, and nonempty text locally before publishing. It does not depend on undocumented provider support for strict structured outputs. Each request has a 60-second limit and a 4,096-token output budget. Requests identify this app as `Vocabularium/0.1.0` and use one stable conversation ID per card, including page retries. [OpenCode Go](https://opencode.ai/docs/go/) is a subscription service intended for coding-agent traffic; the app's live requests succeeded with the owner's key on 12 September 2026. Keep its console **Use balance** option off to stop at subscription limits instead of drawing from Zen credits. The app does not change that account setting.

Without a key, the original capture is still saved. Pages requiring interpretation or generation fail visibly; exact-selection pages still complete. Automated checks inject controlled provider responses and do not spend API credits. The live word/sentence smoke passed with the configured Go key; see the [recorded provider samples](docs/evidence/deepseek-v4.1-flash-smoke-2026-09-12.json) and [hosted word/phrase/sentence results](docs/evidence/render-smoke-2026-09-12.json).

Capture receipts remain local until their account write succeeds. **Try saving again** resubmits the existing operation. Generation results are published only through their originating Chrome session; reopening Chrome fails its interrupted attempts. See [capture implementation evidence](docs/M2-Capture.md) and the authoritative [Select and Add rules](docs/MVP-Product-spec-select-and-add.md).

## Local foundation prototype

The historical M0 laboratory remains covered by PostgreSQL-backed browser fixtures. Manual use of `npm run prototype` requires an explicitly provisioned disposable database in `PROTOTYPE_DATABASE_URL`. It listens on `127.0.0.1:4317` and generates illustrative output; do not point it at the development account or deploy it as the product backend.

## Acceptance status

The approved v0.2.0 interface iteration adds shared deck actions, a destination-naming capture menu, installation-local Light/Dark appearance and accessible full-row card navigation. Its current checks and owner Windows handoff are tracked in the [v0.2.0 acceptance matrix](docs/v0.2.0-Acceptance.md) and [PR #34](https://github.com/Guccimane44/Vocalbularium/pull/34). The previous Windows acceptance below applies to v0.1.0.

The [acceptance record](docs/M5-Acceptance.md) maps all eleven criteria to automated, hosted, and owner-reported evidence. The owner confirmed Windows and the remaining M5 checks passed, explicitly deferring stale-client recovery after a Render reset to [issue #24](https://github.com/Guccimane44/Vocalbularium/issues/24). That scenario is untested. Render Free does not satisfy durable hosted persistence. `npm run smoke:generation` records a small live integration sample; the [hosted smoke commands](docs/M6-Delivery.md#hosted-verification) exercise the deployed backend explicitly.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Browser checks use temporary isolated profiles and their own servers on ports 4317 and 4318; stop manual servers first. The tests create and remove uniquely named PostgreSQL databases using `.env.postgres` or `TEST_DATABASE_ADMIN_URL`; they reject the development database as a reset target. Linux machines may need `npx playwright install --with-deps chromium`.

For updates, pull the working branch, run `npm ci`, restart the prototype server, and click **Reload** on its extension entry. Extension reload creates a new prototype session and reconciles its unfinished attempts. For the product extension, follow the linked Windows installation/update instructions.
