# M6 delivery preparation

A local candidate can be built and packaged now. It is not the hosted Windows release, and this milestone remains open until the owner's environment is connected and accepted.

## Build and package

With Node.js 24 installed:

```sh
npm ci
npm run build
```

For a configured backend, set `VOCABULARIUM_API_URL` to its actual HTTPS origin before running the build. The build writes that address and its matching Chrome host permission. It rejects addresses containing credentials, a path, or a query. Service credentials stay on the backend.

The ZIP packager requires Python 3 and uses only its standard library:

```sh
python3 scripts/package.py
```

On Windows, `py -3 scripts/package.py` can be used instead. Output is `artifacts/vocabularium-0.1.0-local-candidate.zip` for local builds or `artifacts/vocabularium-0.1.0-configured-candidate.zip` when a remote origin is configured. Each ZIP contains the extension folder, [Windows instructions](Windows-Install.md), source revision, and server address. A SHA-256 checksum accompanies it. The package is labeled as awaiting acceptance.

## Connect Render Free when access is ready

Use the repository's `render.yaml` for one **Free** Node web service. Deploy branch `codex/opencode-render-free` while the implementation PRs are awaiting integration; `main` does not yet contain the app. If using a Blueprint, select that branch and confirm the created web service's branch also matches it. The settings are `npm ci --omit=dev` for build, `npm start` for start, Node 24, `HOST=0.0.0.0`, `DATA_DIR=.data`, and `/health` for readiness. Render supplies `PORT`. Leave automatic deploys off for controlled testing.

Set `OPENCODE_API_KEY` in Render's secret environment settings. The Blueprint requests this value instead of storing it in Git. `OPENCODE_MODEL` defaults to `mimo-v2.5-free`. This candidate uses no paid disk or database. [OpenCode's documentation](https://opencode.ai/docs/zen/) lists the model as temporarily free; the app makes no automatic fallback to a paid model.

Record the resulting HTTPS origin and build the extension for it. Open the service's `/health` address and allow about a minute for a cold start before signing in. Sign into two installations, create sample cards, and verify they read and write the same account. If a request times out while the service wakes, wait and explicitly try again; pending saves keep their existing operation IDs.

[Render Free](https://render.com/docs/free) sleeps after 15 minutes without inbound traffic and erases local files on sleep, restart, and redeploy. Expect decks, cards, authentication sessions, operation receipts, and the generation recovery journal to reset together. After a reset, sign in again and create fresh examples. Client caches and pending saves do not back up the deleted account. Record that reset as a known test-host limitation, not a passed persistence check. Check Render's included usage and spending settings for this zero-cost test; the configuration does not reserve unlimited free capacity.

Local backend restart tests still verify persistence when `DATA_DIR` survives. Durable hosted storage and always-on responsiveness remain open under the [test-phase scope exception](MVP-Product-scope.md#10-first-iteration-delivery-and-deferred-work).

The Render service has not been provisioned, and no deployment or account access is claimed.

## Local package verification

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
