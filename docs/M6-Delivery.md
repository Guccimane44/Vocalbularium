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

## Connect Render when access is ready

Use the repository's `render.yaml` for one Node service and its persistent disk. Deploy the reviewed candidate branch. Set `OPENAI_API_KEY` in Render's secret environment settings; `OPENAI_MODEL` is optional. Keep `DATA_DIR=/var/data/vocabularium` on the attached disk. The server provides `/health` for readiness.

Record the resulting HTTPS origin and build the extension for it. Sign into two installations and verify they read and write the same account. Create a test card, redeploy the backend, and confirm the card and its deck configuration persist. For a filesystem backup, stop the backend and copy the entire data directory, including the database and generation recovery journal, together.

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
- Backend redeploy persistence:
- Remaining issues and next-iteration feedback:

Use the [eleven-criterion evidence matrix](M5-Acceptance.md) for the remaining checks. The final publication-versus-exit boundary and offline capture ordering are still explicit acceptance items.
