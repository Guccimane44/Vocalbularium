# Vocabularium

A vocabulary capture extension being built for Chrome on Windows. The product specifications define the first iteration. Account access, capture, deck configuration, and card workflows are implemented; the complete MVP is not yet delivered.

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

The [Render configuration](render.yaml) defines one service and a persistent disk. It has not been provisioned. Use `HOST`, `PORT`, and `DATA_DIR` to configure a server; `.env.example` documents the local defaults. Login sessions last seven days, and active views refresh every five seconds. Windows installation and delivery-preparation instructions are linked above; owner acceptance remains pending.

## Deck configuration

Deck drafts support all five modules, repeated instances, one to four pages, and word/sentence sample previews. Save applies the layout to existing cards: new pages are empty, retained pages keep their text, and removing saved content requires confirmation against the latest account data. Deleting the default deck requires a replacement; deleting the sole deck creates a fresh empty My Deck.

See [deck verification evidence](docs/M3-Decks.md).

## Card workflows

The card list supports four sort orders. Alphabetical sorting uses Unicode NFKC normalization and lowercase text, followed by JavaScript code-unit order; ties use the stable card ID. Empty front pages sort using empty text, and displayed indices are calculated from the current list.

Manual drafts remain intact when switching pages. **Save** writes all changed pages together; **Cancel** discards the editing session. Leaving the editor offers Save, Discard, or Continue editing. Failed saves retain their drafts and offer **Try saving again**. Only captured cards offer current-page **Retry**, with the required replacement warning. See [card workflow verification](docs/M4-Cards.md).

## Generation

Copy `.env.example` to the ignored `.env` file and configure `OPENAI_API_KEY` there, then restart the account server. Keep the key on the server. The extension never receives it. The default provider is OpenAI Responses with `gpt-5.4-mini-2026-03-17`; `OPENAI_MODEL` can override it.

Without a key, the original capture is still saved. Pages requiring interpretation or generation fail visibly; exact-selection pages still complete. Automated checks inject controlled provider responses and do not spend API credits. Live-provider verification is pending owner configuration.

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

The [acceptance record](docs/M5-Acceptance.md) maps all eleven criteria to local evidence and open release gates. Live provider, hosted persistence, and owner Windows acceptance are still pending. Once the key is configured, `npm run smoke:generation` records a small live integration sample for review.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Browser checks use temporary isolated profiles and their own servers on ports 4317 and 4318; stop manual servers first. The tests remove their temporary data afterwards. Linux machines may need `npx playwright install --with-deps chromium`.

For updates, pull the working branch, run `npm ci`, restart the prototype server, and click **Reload** on its extension entry. Extension reload creates a new prototype session and reconciles its unfinished attempts. For the product extension, follow the linked Windows installation/update instructions.
