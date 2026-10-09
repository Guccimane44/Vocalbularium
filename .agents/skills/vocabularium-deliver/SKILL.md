---
name: vocabularium-deliver
description: "Build and verify a Vocabularium extension candidate for the agreed backend, record its checksum, and prepare the owner handoff. Use for packaging or delivery; hosting and backend cutover are separate requested work."
---

# Vocabularium Deliver

Prepare an installable candidate with evidence tied to its actual source and backend. Paths below are relative to the current Vocabularium repository root.

## Establish the candidate

Read `AGENTS.md`, `package.json`, `scripts/build.mjs`, `scripts/package.py`, and the [installation guide](../../../docs/guides/windows-install.md). Use [current product scope](../../../docs/product/scope.md#current-delivery-boundary) and the [local PostgreSQL guide](../../../docs/architecture/local-postgresql.md) for the supported operating environment. Read the [compatibility policy](../../../docs/architecture/terminology-compatibility.md#upgrade-procedure-and-retirement) when delivering a backend/schema or extension upgrade. `docs/history/mvp/M6-Delivery.md` contains earlier delivery evidence and historical hosted procedures; do not treat its old service settings or acceptance results as a current deployment specification.

The supported candidate connects to a local, single-account PostgreSQL-backed API on loopback. The older Render/SQLite backend and its extension profile are separate; preserve them. Take the intended origin, version, source revision, and backend revision from the request and current project records, rather than assuming an old service or milestone is the target.

Follow the [project workflow](../../../docs/guides/project-workflow.md) to consult the relevant Notion milestone and delivery decisions. Confirm publication, deployed revision, and pending owner checks from the current GitHub tracker/release evidence; a repository implementation note may predate an authorized deployment. A milestone marked Done does not identify which candidate the owner installed or accepted.

Inspect the working tree and existing artifacts. Preserve a previous owner-delivered ZIP/checksum before a same-version build would overwrite it. Use a committed source revision for a final handoff and do not label a dirty build as a clean candidate. A preliminary local package may remain clearly labeled as such. Version changes follow the requested increment and delivery decision; packaging alone does not require inventing a new version.

## Build and verify

Use the runtime required by `package.json`. Existing commands, run from the repository root:

```sh
npm run build
python3 scripts/package.py
```

With `VOCABULARIUM_API_URL` unset, the build targets `http://127.0.0.1:4318`; inspect any inherited value before building. Set it explicitly when a different agreed origin is required. The build accepts HTTP localhost or HTTPS and writes the matching extension permission. Selecting an HTTPS origin does not deploy the backend or establish compatibility with the historical Render service. Service credentials and database connection settings remain on the server.

Use the bundled read-only helper after packaging:

```sh
python3 .agents/skills/vocabularium-deliver/scripts/verify_package.py <candidate.zip> --expect-origin <agreed-origin> --expect-revision <source-commit>
```

It checks archive integrity and contents, source metadata, clean-build status, version/origin/permission consistency, known test hooks, and the SHA-256 sidecar. It does not extract files, contact services, prove runtime behavior, or discover arbitrary unknown credentials. If `OPENCODE_API_KEY` or `OPENAI_API_KEY` is already in the process environment, it also rejects those exact values in archive contents without printing them. Do not load or reveal a key merely to run this checker.

For a local candidate, test the extracted extension through applicable scenarios in `tests/app.browser.test.mjs` using `VOCABULARIUM_TEST_EXTENSION`; see `$vocabularium-verify` for PostgreSQL fixtures, build hooks, and port requirements. Those scenarios own their local API and disposable database and use controlled generation providers; they do not require or verify the owner's running development account. They expect the local test origin, so do not point them at a remote candidate and treat an origin mismatch as an app regression.

When a hosted walkthrough is separately requested or already authorized, use the hosted browser check against a temporary extraction and a compatible agreed HTTPS backend. Its `VOCABULARIUM_HOSTED_CHECK=interface` mode exercises manual editing and synchronization without provider calls; default mode also needs the API smoke samples. Inspect CI artifact metadata before delivery: its local ZIP is not an artifact for a hosted origin.

If checks fail, fix or explain the concrete problem before handing off the package. Recheck only what the fix affects. A package-only task ends with a verified artifact, not a deployment.

## Backend upgrade or hosting, when in scope

Packaging does not apply migrations, update the owner's API, import old account data, or deploy a service. When a local backend upgrade is part of the request, follow the reviewed PostgreSQL backup/migration procedure with the API stopped and install the compatible backend before updating the extension. Preserve the database and `DATA_DIR/generation-outbox`: PostgreSQL persistence does not make the filesystem generation journal durable. Use a separate Chrome profile when moving between the historical hosted account and the local account; do not carry their caches or pending operations across.

The existing `render.yaml` describes the historical SQLite deployment and cannot deploy the current backend as-is: it supplies no PostgreSQL `DATABASE_URL` and binds to `0.0.0.0`, which the current startup policy rejects. Current hosting needs explicit work on database provisioning, network/authentication policy, durable journal storage, and deliberate account/profile cutover. Do not reuse the old Render configuration or redeploy the shared historical service to verify a package.

For an explicitly requested hosting change, establish the compatible source and concrete deployment configuration before performing external changes. Verify the actual service, branch, build/start settings, and storage through the available integration or signed-in browser; preserve valid session authorization. Keep package revision, installed backend revision, and deployment evidence distinct. After an authorized upgrade/deploy, verify readiness and relevant behavior. Read back uncertain deployment state before retrying; preserve operation IDs on save recovery instead of regenerating or blindly redeploying. Never record secrets in GitHub or bundle them into the extension.

## Handoff

Within the user's tracking authorization, summarize delivery in the existing Notion milestone: candidate version/source, backend target and known installed revision, SHA-256, verification/delivery links, and outstanding owner checks. Keep full package evidence in the delivery issue/PR or release record. Complete only the milestone's stated scope; packaging, publication, deployment, and owner acceptance require their own evidence. For a standalone package without a milestone, do not invent one. If Notion is unavailable, report the proposed update as pending.

Record version, package path, SHA-256, source revision, backend origin and installed/deployed revision, verification, and remaining owner checks in the delivery issue/PR. Link the installation and local setup/update instructions. Preserve historical evidence rather than replacing it with assumed results. Keep archive verification, controlled local browser checks, owner installation, backup/restore rehearsals, and native Windows acceptance distinct; automated Windows packaging does not establish native PostgreSQL/browser or owner update acceptance. Keep current acceptance status in project records rather than freezing it in this skill.
