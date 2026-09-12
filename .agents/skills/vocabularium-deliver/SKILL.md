---
name: vocabularium-deliver
description: "Build and verify a Vocabularium extension candidate for an agreed backend, record its checksum, and prepare the owner handoff. Use for packaging or delivery; deploy to Render only when requested or already authorized, not as a side effect of building a ZIP."
---

# Vocabularium Deliver

Prepare an installable candidate with evidence tied to its actual source and backend. Paths below are relative to the current Vocabularium repository root.

## Establish the candidate

Read `AGENTS.md`, `package.json`, `scripts/build.mjs`, `scripts/package.py`, and the current `docs/M6-Delivery.md` and `docs/Windows-Install.md`. Take the intended origin, version, and backend revision from the request and current deployment evidence; do not hard-code an old service, model, commit, or milestone into a new delivery.

Inspect the working tree and existing artifacts. Preserve a previous owner-delivered ZIP/checksum before a same-version build would overwrite it. Use a committed source revision for a final handoff and do not label a dirty build as a clean candidate. A preliminary local package may remain clearly labeled as such. Version changes follow the requested increment and delivery decision; packaging alone does not require inventing a new version.

## Build and verify

Use the runtime required by `package.json`. Existing commands, run from the repository root:

```sh
npm run build
python3 scripts/package.py
```

The default build targets localhost. For a hosted candidate, provide `VOCABULARIUM_API_URL` with the agreed HTTPS origin when building; see `docs/M6-Delivery.md` for shell-specific examples. The build writes the matching extension permission. Service credentials remain on the server.

Use the bundled read-only helper after packaging:

```sh
python3 .agents/skills/vocabularium-deliver/scripts/verify_package.py <candidate.zip> --expect-origin <agreed-origin> --expect-revision <source-commit>
```

It checks archive integrity and contents, source metadata, clean-build status, version/origin/permission consistency, known test hooks, and the SHA-256 sidecar. It does not extract files, contact services, prove runtime behavior, or discover arbitrary unknown credentials. If `OPENCODE_API_KEY` or `OPENAI_API_KEY` is already in the process environment, it also rejects those exact values in archive contents without printing them. Do not load or reveal a key merely to run this checker.

When a hosted walkthrough is warranted and authorized, run the existing hosted browser check against a temporary extraction via `VOCABULARIUM_TEST_EXTENSION`; see `$vocabularium-verify`. Existing local browser tests expect a local server, so do not point them at a remote candidate and treat the resulting mismatch as an app regression. The normal CI workflow may produce localhost artifacts; inspect their metadata before handing one to an owner using Render.

If checks fail, fix or explain the concrete problem before handing off the package. Recheck only what the fix affects. A package-only task ends with a verified artifact, not a deployment.

## Hosted deployment, when in scope

Read the current deployment record and `render.yaml`. Verify the actual service, plan, branch, build/start settings, and deployed revision through an available Render integration or the signed-in browser. Reuse the existing test service and current configuration unless the owner asks to change them. Prepare the concrete candidate before any missing approval; preserve valid authorization already given in the session.

Render Free's temporary storage is an explicit project constraint: a deployment/restart may reset account data and sessions. Do not restart a shared service simply to verify a package, upgrade the plan, or transfer a new secret without applicable authorization. Keep the deployment revision distinct from a later package revision containing only documentation/test changes. Never record secrets in GitHub or bundle them into the extension.

After an authorized deploy, verify health, the deployed revision, and relevant hosted behavior. Bound cold-start waiting and use the existing pending operation on save retry; do not blindly redeploy or regenerate on an ambiguous result. Read back deployment state before retrying an uncertain mutation.

## Handoff

Record version, package path, SHA-256, source revision, backend origin/deployed revision, verification, and remaining owner checks in the delivery issue/PR. Link the installation guide. Preserve historical evidence rather than replacing it with assumed results. Automated Windows packaging is not native owner installation/update acceptance. Keep current acceptance status in project records rather than freezing it in this skill.
