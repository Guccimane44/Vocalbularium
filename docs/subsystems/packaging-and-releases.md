# Packaging and releases

A release is a version of the extension built for one API origin, packaged as a ZIP with its install guide and release notes, and checked by CI on every push. This page covers the build, the package, the release notes and CI. How an agent prepares a candidate and hands it to the owner is in the [Deliver skill](../../.agents/skills/vocabularium-deliver/SKILL.md); installing it is in the [install guide](../guides/install.md).

## Responsibilities and sources of truth

| Part | Responsibility | Source |
| --- | --- | --- |
| Version | One version for the API and the extension. | `version` in [`package.json`](../../package.json) |
| Packages | The contracts and domain packages compiled to `dist/`, which the API and extension import, with the catalog's page text generated. | [`build-packages.mjs`](../../scripts/build-packages.mjs) (`npm run build:packages`) |
| Extension build | The extension bundled into `artifacts/extension`, with the API origin (`VOCABULARIUM_API_URL`, `http://127.0.0.1:4318` by default) and its permission, the build's commit, the fonts and their licences. | [`build.mjs`](../../scripts/build.mjs) (`npm run build`); `config.js` in the build |
| Package | `artifacts/vocabularium-<version>-<local\|configured>-candidate.zip` with the extension, `INSTALL.md`, `RELEASE.md` and source metadata, and a `.sha256` beside it. | [`package.py`](../../scripts/package.py) |
| Release notes | One file per release saying what its upgrade keeps, discards and needs. | [`docs/releases/`](../releases/README.md) |
| Build identity | The version and commit on the homepage and login page, `/health/live`, and the account menu's warning when the API and extension differ. | [`source-stamp.mjs`](../../src/server/source-stamp.mjs), [`version-line.ts`](../../extension/version-line.ts), [`builds.js`](../../extension/builds.js) |
| CI | `npm run check`, the decision issues, the OpenAPI reference, the unit and database suites, `npm run check:sessions`, the browser suite, the build and package on Ubuntu and Windows, and the screens job. | [`.github/workflows/verify.yml`](../../.github/workflows/verify.yml) |

## Runtime path

1. Write `docs/releases/<version>.md` and list it in [the releases index](../releases/README.md); point the [install guide](../guides/install.md) at it.
2. `npm run build` builds the packages and the extension for the chosen origin, stamping the commit it was built from.
3. `python3 scripts/package.py` checks the build and writes the ZIP and its checksum.
4. The Deliver skill's `verify_package.py` checks the archive against the agreed origin and revision before handoff.

## Behaviour

- **A package names its build.** `package.py` refuses to package without `docs/releases/<version>.md`, when the install guide doesn't point at it, when the extension was built from another commit than the checkout, or when the build holds an unexpected file. A build from a working tree with uncommitted changes is packaged, but its metadata says so.
- **A release says its upgrade.** An upgrade keeps accounts and sign-in; each release file says when decks and pages are discarded. The ZIP carries it as `RELEASE.md`.
- **The local variant** targets `127.0.0.1` or `localhost`; any other origin makes a `configured` package and must be HTTPS.
- **The API and the extension under discussion are the ones built from the code under discussion.** Both show their version and commit, and the account menu warns when the two differ.

## Constraints and failure behaviour

- **Merging needs every check green** on a branch up to date with `main` (the GitHub ruleset "main: verify must pass").
- **A browser test that fails at random is named, never passed over**: `scripts/browser-tests.mjs` reruns a failed file once and fails the run either way.
- **An API change regenerates `docs/api/openapi.json`** (`npm run openapi`); CI fails when it is stale.
- **A request to package doesn't authorise publishing, deploying or migrating** the owner's running API.

## Verification

| Check | What it covers |
| --- | --- |
| `npm run build && python3 scripts/package.py` | The build and the package's own checks |
| `verify_package.py` in the [Deliver skill](../../.agents/skills/vocabularium-deliver/SKILL.md) | The archive, its metadata, origin, permission, release file and checksum |
| [`tests/extension.test.mjs`](../../tests/extension.test.mjs), [`tests/server.test.mjs`](../../tests/server.test.mjs) | The build warning when API and extension differ; `/health/live` and a failed second start naming the running build |
| The Verify workflow | Everything above on every push and pull request |
