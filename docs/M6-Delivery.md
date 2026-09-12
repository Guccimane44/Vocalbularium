# M6 delivery candidate

A configured candidate connects to the live Render Free backend and passes hosted generation and two-installation synchronization checks. This milestone remains open until the owner tests installation and updates on Windows and the remaining acceptance items are resolved.

## Build and package

With Node.js 24 installed:

```sh
npm ci
npm run build
```

For the deployed test backend, build with:

```sh
VOCABULARIUM_API_URL=https://vocabularium.onrender.com npm run build
```

In PowerShell, use `$env:VOCABULARIUM_API_URL='https://vocabularium.onrender.com'` followed by `npm run build`. The build writes that address and its matching Chrome host permission. It rejects addresses containing credentials, a path, or a query. Service credentials stay on the backend.

The ZIP packager requires Python 3 and uses only its standard library:

```sh
python3 scripts/package.py
```

On Windows, `py -3 scripts/package.py` can be used instead. Output is `artifacts/vocabularium-0.1.0-local-candidate.zip` for local builds or `artifacts/vocabularium-0.1.0-configured-candidate.zip` when a remote origin is configured. Each ZIP contains the extension folder, [Windows instructions](Windows-Install.md), source revision, and server address. A SHA-256 checksum accompanies it. The package is labeled as awaiting acceptance.

## Render Free deployment

Deployed on 12 September 2026 and confirmed **Live**:

- Origin: `https://vocabularium.onrender.com`; [health check](https://vocabularium.onrender.com/health).
- Service: `srv-daiksf5g1s2s73fonl9g`; [deployment record](https://dashboard.render.com/web/srv-daiksf5g1s2s73fonl9g/deploys/dep-daiksflg1s2s73fonnu0).
- Backend source: `de86975bb4183d4ef3300af7b23a497087fe2bad` on `codex/opencode-render-free`.
- Free compute in Frankfurt, Node 24 (deployed runtime 24.21.0), no persistent disk, automatic deploys off.
- OpenCode Go `deepseek-v4.1-flash`, with the owner-approved API key stored in Render's secret environment settings.

Later documentation, smoke-test, and packaging commits do not change this running backend revision. Deploying a newer revision is an explicit operation because automatic deploys are off.

Use the repository's `render.yaml` for one **Free** Node web service. Deploy branch `codex/opencode-render-free` while the implementation PRs are awaiting integration; `main` does not yet contain the app. If using a Blueprint, select that branch and confirm the created web service's branch also matches it. The settings are `npm ci --omit=dev` for build, `npm start` for start, Node 24, `HOST=0.0.0.0`, `DATA_DIR=.data`, and `/health` for readiness. Render supplies `PORT`. Leave automatic deploys off for controlled testing.

Set `OPENCODE_API_KEY` in Render's secret environment settings. The Blueprint requests this value instead of storing it in Git. `OPENCODE_MODEL` defaults to `deepseek-v4.1-flash`. This candidate uses no paid disk or database. Generation uses the owner's [OpenCode Go subscription](https://opencode.ai/docs/go/) through the Go endpoint. The app identifies itself honestly and does not switch models or use the separate Zen endpoint. Leave **Use balance** disabled in OpenCode if usage must stop at the subscription limit. The server does not change that console setting.

Record the resulting HTTPS origin and build the extension for it. Open the service's `/health` address and allow about a minute for a cold start before signing in. Sign into two installations, create sample cards, and verify they read and write the same account. If a request times out while the service wakes, wait and explicitly try again; pending saves keep their existing operation IDs.

[Render Free](https://render.com/docs/free) sleeps after 15 minutes without inbound traffic and erases local files on sleep, restart, and redeploy. Expect decks, cards, authentication sessions, operation receipts, and the generation recovery journal to reset together. After a reset, sign in again and create fresh examples. Client caches and pending saves do not back up the deleted account. Record that reset as a known test-host limitation, not a passed persistence check. Check Render's included usage and spending settings for this zero-cost test; the configuration does not reserve unlimited free capacity.

Local backend restart tests still verify persistence when `DATA_DIR` survives. Durable hosted storage and always-on responsiveness remain open under the [test-phase scope exception](MVP-Product-scope.md#10-first-iteration-delivery-and-deferred-work).

## Hosted verification

The live provider smoke, hosted API smoke, and two-profile browser smoke passed on 12 September 2026. Each API run creates three synthetic sample captures in the initial default layout and uses the live provider. It also verifies retry, operation replay, ordered page edits, preservation of other pages, deletion, and concurrent deck configuration with revalidated content-loss warnings. Its temporary configuration deck is deleted afterwards. The browser check uses the samples and creates, edits, synchronizes, and deletes its own manual card through the real extension UI.

Run explicitly against the disposable test account, with the initial My Deck layout and Chromium installed:

```sh
VOCABULARIUM_API_URL=https://vocabularium.onrender.com npm run smoke:hosted
VOCABULARIUM_API_URL=https://vocabularium.onrender.com npm run build
VOCABULARIUM_API_URL=https://vocabularium.onrender.com npm run smoke:hosted:browser
```

Reports are written to `.data/hosted-smoke.json` and `.data/hosted-browser-smoke.json`. The reviewed [API samples](evidence/render-smoke-2026-09-12.json) and [browser result](evidence/render-browser-smoke-2026-09-12.json) are committed without credentials or session tokens. Ordinary unit/browser CI does not invoke this live service or spend provider usage. Use `VOCABULARIUM_TEST_EXTENSION` to run the hosted browser check against an extracted configured ZIP.

A fresh sign-in after an idle interval found an empty My Deck; another live generation pass succeeded. This is consistent with the expected Free-host reset limitation. A controlled sleep/redeploy reset with stale extension credentials and pending saves, native Windows selection/feedback, and extension updates remain open acceptance checks.

## Package verification

The 0.1.0 local candidate ZIP passes its archive integrity check. It contains only the extension, Windows instructions, and package metadata; no server code, API key, or test-only capture hook is included. The extension extracted from the ZIP passes the account/login/reopening scenario and the manual-card workflow scenario in isolated Chromium profiles on macOS.

GitHub verification also builds and packages a local candidate on Windows and Linux and retains it as a workflow artifact for 14 days using the [GitHub artifact action](https://github.com/actions/upload-artifact/blob/main/README.md). This verifies packaging, not native owner Windows acceptance.

## Owner acceptance record

Complete these fields in issue #12 once the Windows environment is available:

- Package version and checksum:
- Source revision:
- Hosted backend origin:
- Windows version:
- Chrome version and background-mode setting:
- Installation/update result:
- Word/phrase/sentence capture and live module results:
- Manual editing, retry, deck changes, and second-installation synchronization:
- Normal/abrupt Chrome exit and restricted-page feedback:
- Render sleep/redeploy reset and fresh sign-in (expected test limitation):
- Durable hosted persistence (deferred; not satisfied by Render Free):
- Remaining issues and next-iteration feedback:

Use the [eleven-criterion evidence matrix](M5-Acceptance.md) for the remaining checks. The final publication-versus-exit boundary and offline capture ordering are still explicit acceptance items.
