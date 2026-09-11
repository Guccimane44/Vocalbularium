# Vocabularium

A vocabulary capture extension being built for Chrome on Windows. The product specifications define the first iteration; the current code is an **M0 foundation prototype**, not the completed MVP.

- [MVP delivery tracker and milestone issues](https://github.com/Guccimane44/Vocalbularium/issues/5)
- [Implementation plan](docs/MVP-Implementation-plan.md)
- [Foundation decisions and verification](docs/M0-Foundation.md)
- [MVP scope](docs/MVP-Product-scope.md)

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

Browser checks use temporary isolated profiles and their own server on port 4317; stop the manual prototype server first. The tests remove their temporary data afterwards. Linux machines may need `npx playwright install --with-deps chromium`.

For updates, pull the working branch, run `npm ci`, restart the prototype server, and click **Reload** on its extension entry. Extension reload creates a new prototype session and reconciles its unfinished attempts. Final Windows package and update instructions belong to M6.
