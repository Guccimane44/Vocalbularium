# Vocabularium

A vocabulary capture extension being built for Chrome on Windows. Account access, capture, deck configuration, and card workflows are implemented. The Render Free backend and OpenCode Go generation are live; owner Windows acceptance remains open.

- [MVP delivery tracker and milestone issues](https://github.com/Guccimane44/Vocalbularium/issues/5)
- [Implementation plan](docs/MVP-Implementation-plan.md)
- [Foundation decisions and verification](docs/M0-Foundation.md)
- [Windows installation](docs/Windows-Install.md) and [delivery preparation](docs/M6-Delivery.md)
- [MVP scope](docs/MVP-Product-scope.md)

## Account and dashboard

Install Node.js 24, then run from the repository root:

```sh
npm ci
npm start
```

In Chrome, load the repository's `extension` folder through `chrome://extensions` → Developer mode → **Load unpacked**. Click the extension button and sign in with username `admin` and password `admin`.

The account server listens on `127.0.0.1:4318` and persists data in `.data/account.sqlite`. Both extension installations use the same account when pointed at this server. Select text on a webpage and choose **Add to default deck**. Recent outcomes appear on the dashboard; open a card to navigate its plain-text pages. Use **Add new deck** or a deck’s **••• → Configure deck** menu to edit its pages and modules. Open a card to edit its pages or retry a captured page; use **Add card manually** in a deck for a blank card.

Build an installable extension folder with:

```sh
npm run build
```

The output is `artifacts/extension`. For a hosted backend, set `VOCABULARIUM_API_URL` to its HTTPS origin when building; the build writes the matching extension host permission. No credentials are embedded in the package.

The [Render test backend](https://vocabularium.onrender.com/health) is live on the Free plan, with no paid disk. Render discards its local SQLite data on sleep, restart, or redeploy; local development still persists data in `.data`. See the [deployment and hosted testing procedure](docs/M6-Delivery.md#render-free-deployment). Use `HOST`, `PORT`, and `DATA_DIR` to configure a server; `.env.example` documents the local defaults. Login sessions last seven days unless the test server resets, and active views refresh every five seconds.

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

Install Node.js 24, then run from the repository root:

```sh
npm ci
npm run prototype
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the repository's `prototypes/extension` folder. Open the extension's dashboard, then use **Open reading fixture**. Select text and choose **Add to default deck** from the context menu.

The prototype backend listens only on `127.0.0.1:4317`. It stores its test account in `.data/foundation.sqlite` and produces clearly labeled illustrative text after a delay. It does not implement login, live generation, or the complete product screens. Do not deploy this laboratory server as the account backend.

## Acceptance status

The [acceptance record](docs/M5-Acceptance.md) maps all eleven criteria to evidence and open release gates. Live generation and hosted synchronization pass, including two real extension installations. Native owner Windows acceptance and the remaining lifecycle boundaries are pending. Render Free does not satisfy durable hosted persistence. `npm run smoke:generation` records a small live integration sample; the [hosted smoke commands](docs/M6-Delivery.md#hosted-verification) exercise the deployed backend explicitly.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Browser checks use temporary isolated profiles and their own servers on ports 4317 and 4318; stop manual servers first. The tests remove their temporary data afterwards. Linux machines may need `npx playwright install --with-deps chromium`.

For updates, pull the working branch, run `npm ci`, restart the prototype server, and click **Reload** on its extension entry. Extension reload creates a new prototype session and reconciles its unfinished attempts. For the product extension, follow the linked Windows installation/update instructions.
