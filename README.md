# Vocabularium

A vocabulary capture extension for Chrome, at release 0.7.1. A local Fastify API with PostgreSQL 18 serves one owner-test account; the extension's dashboard, deck settings and page editor use WXT and React.

The product uses deck → page → component. A page holds a main key, optional Context, one component per configured content module, and your own text.

- [Product model](docs/product/model.md): the terms
- [Current scope](docs/product/scope.md): what 0.7.1 supports, with links to each specification
- [Vision](docs/product/vision.md): where the product is going
- [Project workflow](docs/guides/project-workflow.md): how decisions become specifications and releases
- [Install a candidate package](docs/guides/install.md): load and update the extension in Chrome
- [Local PostgreSQL setup](docs/architecture/local-postgresql.md) and [diagnostic logs](docs/guides/diagnostics.md)
- [History](docs/history/): the MVP, the Render deployment, Windows delivery, and finished plans

Upgrading from the karte/seite build discards its decks and kartes, as the owner decided ([Q72](docs/architecture/questionnaire/answers/answers-06-data-and-semantics.md#q72)); accounts and sign-in stay. Back up the database, install the updated backend and run its reviewed migrations, then update the extension. Older extension builds cannot use the new API.

## Account and dashboard

Install Node.js 24 and start PostgreSQL 18 on loopback using the [local setup instructions](docs/architecture/local-postgresql.md), then run from the repository root:

```sh
npm ci
npm run db:setup
npm start
```

Build the extension with `npm run build`, then load `artifacts/extension` through `chrome://extensions` → Developer mode → **Load unpacked**. Click the extension button and sign in with username `admin` and password `admin`.

The account server listens on `127.0.0.1:4318` and persists data in the local `vocabularium_dev` PostgreSQL database. Both extension installations use the same account when pointed at this server. Use a separate Chrome profile for this fresh account. Select text on a webpage and choose **Create a page in “My Deck”** (or the current default deck name). Recent outcomes appear on the dashboard; open a page to see its components. Use **Add new deck** or a deck’s **••• → Configure deck** menu to edit its modules. Open a page to edit it, generate missing components, or retry one component or the whole page; use **Add page manually** in a deck to enter a main key yourself.

Build an installable extension folder with:

```sh
npm run build
```

WXT writes the Chrome Manifest V3 build to `artifacts/extension`. For a hosted backend, set `VOCABULARIUM_API_URL` to its HTTPS origin when building; the build writes the matching extension host permission. No credentials are embedded in the package. The generated manifest is checked against the source identity and permissions during the build.

The earlier Render/SQLite deployment is retired; its [testing procedure](docs/history/mvp/M6-Delivery.md#render-free-deployment) is kept as history.

The local API uses Fastify and validates its startup settings. `npm run db:setup` writes ignored `.env.postgres` with separate application, migration, and test connections. Set provider options, `HOST` (loopback only), `PORT`, `DATA_DIR` (generation journal), and `LOG_LEVEL` in `.env`. `GENERATION_MAX_ACTIVE` and `GENERATION_MAX_QUEUED` bound active and waiting component attempts (defaults: 4 and 16). Login sessions last seven days; active views refresh every five seconds. `GET /health/live` checks process liveness; `GET /health/ready` and the compatible `GET /health` check database readiness and API ownership. The [OpenAPI JSON reference](docs/api/openapi.json) is generated with `npm run openapi` without a database connection.

Use `npm run db:generate` to prepare reviewed schema changes and `npm run db:migrate` with the API stopped to apply them. Normal API requests use the restricted application role. [Backup/restore commands and ordering/recovery details](docs/architecture/local-postgresql.md) explain the one-process limit and durable journal requirement.

## Deck settings

A deck has an ordered list of up to 12 content modules, with repeated instances and word/sentence sample previews. Configuration changes apply to later generation only: existing pages keep their components, including those of removed modules, until you generate or retry. Deleting the default deck requires a replacement; deleting the sole deck creates a fresh My Deck. **Capture with Context** (on by default) makes capture into the deck also take the text around the selection, up to about 500 characters, as the page's Context; the page URL and title are never taken.

## Page workflows

The page list shows each page's main key and loads up to 30 pages at a time in any of four sort orders. Alphabetical sorting uses Unicode NFKC normalization and lowercase text, followed by JavaScript code-unit order; ties use the stable page ID. Decks load in batches of 40; page and deck detail is fetched when opened.

A page shows its main key, Context, one component per configured module (or a "Not generated yet" placeholder), and your own text. **Edit page** edits every text component; **Save** writes them together and **Cancel** discards the session. Manually created pages generate only when you click **Generate**. **Generate missing** fills components for newly added modules; **Retry** on one component, or **Retry page**, replaces generated content after a confirmation warning. Failed saves retain their drafts and offer **Try saving again**.

## Generation

Copy `.env.example` to the ignored `.env` file (or add its generation settings to your existing file), configure `OPENCODE_API_KEY` with your OpenCode Go key, then restart the account server. Keep the key on the server. The extension never receives it. The default is `deepseek-v4.1-flash` through `https://opencode.ai/zen/go/v1/chat/completions`; `OPENCODE_MODEL` can override the model. Requests never fall back to another model automatically.

The adapter requests JSON in its instructions and validates the completion status, object fields, the word-or-sentence classification, and nonempty text locally before publishing. It does not depend on undocumented provider support for strict structured outputs. Each request has a 60-second limit and an 8,192-token output budget. Requests identify this app as `Vocabularium/0.7.1` and use one stable conversation ID per page, including retries. [OpenCode Go](https://opencode.ai/docs/go/) is a subscription service intended for coding-agent traffic; the app's live requests succeeded with the owner's key on 12 September 2026. Keep its console **Use balance** option off to stop at the subscription limit instead of drawing from Zen credits. The app does not change that account setting.

Without a key, the original capture is still saved. Components requiring interpretation or generation fail visibly; exact-selection components still complete. Automated checks inject controlled provider responses and do not spend API credits. The live word/sentence smoke passed with the configured Go key; see the [recorded provider samples](docs/history/evidence/deepseek-v4.1-flash-smoke-2026-09-12.json) and [hosted word/phrase/sentence results](docs/history/evidence/render-smoke-2026-09-12.json).

Capture receipts remain local through confirmed handoff to server pages; pending receipts and saves remain available for explicit recovery. **Try saving again** resubmits the existing operation. Generation results are published only through their originating Chrome session; reopening Chrome fails its interrupted attempts. The [capture and generation specification](docs/specs/capture-and-generation.md) holds the authoritative rules.

## Release status

Release evidence lives in the tracker issues and PRs, such as [#81](https://github.com/Guccimane44/Vocalbularium/issues/81) for 0.4.0. The owner accepted the earlier hosted MVP on 13 September 2026; its [acceptance record](docs/history/mvp/M5-Acceptance.md) and the retired Render and Windows procedures are kept in [history](docs/history/). `npm run smoke:generation` records a small live provider sample.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Browser checks use temporary isolated profiles and their own servers on ports 4317 and 4318; stop manual servers first. The tests create and remove uniquely named PostgreSQL databases using `.env.postgres` or `TEST_DATABASE_ADMIN_URL`; they reject the development database as a reset target. Linux machines may need `npx playwright install --with-deps chromium`.

For updates, pull the working branch, run `npm ci`, apply reviewed migrations with the API stopped, restart the API, then reload the unpacked extension and open dashboard tabs. Extension reload ends that installation's generation session; review interrupted components using the [capture and generation rules](docs/specs/capture-and-generation.md).
