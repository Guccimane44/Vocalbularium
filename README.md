# Vocabularium

A vocabulary capture extension being built for Chrome on Windows. The product specifications define the first iteration. The account/login/dashboard milestone is under development; the complete MVP is not yet delivered.

- [MVP delivery tracker and milestone issues](https://github.com/Guccimane44/Vocalbularium/issues/5)
- [Implementation plan](docs/MVP-Implementation-plan.md)
- [Foundation decisions and verification](docs/M0-Foundation.md)
- [MVP scope](docs/MVP-Product-scope.md)

## Account and dashboard

Install Node.js 24, then run from the repository root:

```sh
npm ci
npm start
```

In Chrome, load the repository's `extension` folder through `chrome://extensions` → Developer mode → **Load unpacked**. Click the extension button and sign in with username `admin` and password `admin`.

The account server listens on `127.0.0.1:4318` and persists data in `.data/account.sqlite`. Both extension installations use the same account when pointed at this server. Capture and the remaining editor workflows are added by subsequent milestones.

Build an installable extension folder with:

```sh
npm run build
```

The output is `artifacts/extension`. For a hosted backend, set `VOCABULARIUM_API_URL` to its HTTPS origin when building; the build writes the matching extension host permission. No credentials are embedded in the package.

The [Render configuration](render.yaml) defines one service and a persistent disk. It has not been provisioned. Use `HOST`, `PORT`, and `DATA_DIR` to configure a server; `.env.example` documents the local defaults. Login sessions last seven days, and active views refresh every five seconds. Full Windows delivery instructions follow in M6.

## Local foundation prototype

Install Node.js 24, then run from the repository root:

```sh
npm ci
npm run prototype
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the repository's `prototypes/extension` folder. Open the extension's dashboard, then use **Open reading fixture**. Select text and choose **Add to default deck** from the context menu.

The prototype backend listens only on `127.0.0.1:4317`. It stores its test account in `.data/foundation.sqlite` and produces clearly labeled illustrative text after a delay. It does not implement login, live generation, or the complete product screens. Do not deploy this laboratory server as the account backend.

## Verification

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Browser checks use temporary isolated profiles and their own servers on ports 4317 and 4318; stop manual servers first. The tests remove their temporary data afterwards. Linux machines may need `npx playwright install --with-deps chromium`.

For updates, pull the working branch, run `npm ci`, restart the prototype server, and click **Reload** on its extension entry. Extension reload creates a new prototype session and reconciles its unfinished attempts. Final Windows package and update instructions belong to M6.
