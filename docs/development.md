# Reproducible local development

The reference environment is macOS with Node **22.21.0** (`.node-version`) and
npm **10.9.4** (`package.json`). Other platforms are not yet verified. If the
shell cannot find Node or npm, install/select that toolchain using your usual
version manager first; a Node-based doctor cannot run before Node exists.

From a clean checkout:

```sh
npm run setup
npm run doctor
npm --prefix apps/web run db:migrate
npm run dev
```

Open the local address printed by the server and use the private-preview sign-in
link. Stop that process with Ctrl-C when finished. Local preview uses the existing
Sites development plugin. No email, Apple or provider credentials are required.

Setup checks the exact runtime and tracked metadata before `npm ci` installs
web dependencies. It does not install global tools, change the lockfile, repair
configuration or contact hosted Sites. Installing dependencies may require the
npm registry; network/cache failure is an installation failure, not product evidence.
For a warm cache, `npm_config_offline=true npm run setup` explicitly forbids fetches.
An empty cache needs an online install first; offline success is not hermeticity.

`npm run doctor` checks runtime, package/lock metadata, manifests, local D1 binding,
installed direct dependencies and required executables without reading personal
environment files or contacting services. `-- --json` provides structured output.
Native tools are reported as optional; neither their presence nor a parser check
establishes iOS compilation. Doctor never fixes its findings automatically.

```sh
npm run verify:fast
npm run verify
```

Fast verification runs doctor, tooling failure tests, the application suite,
TypeScript and Chrome/service-worker syntax checks. Full verification adds the
production build and root staging. Every subprocess failure stops the sequence.
At plan 001, neither command includes actual browser/HTTP/native verification or
lint: those are later plan gates. `npm --prefix apps/web run lint` remains a
separate, known-red baseline; no rules were weakened.

## Local state and outputs

Dependencies live in `apps/web/node_modules`; builds replace `apps/web/dist` and
root `dist`. D1, registry and logs use web-local `.wrangler` paths by default.
Browser data belongs to its origin/profile, not the checkout. Never reset a
personal database/profile for tests. Until plan 002's launcher is available,
bootstrap verification uses one disposable checkout at a time with no personal
`.env`/`.dev.vars`, no live credentials, and separate temporary state. A branch
does not isolate the shared registered Site; none of these commands deploys.

## Server environment inventory

Keep values out of Git and evidence. Blank examples are names/documentation only.

| Variables | Consumer / purpose | Required for local fixtures? |
| --- | --- | --- |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | `lib/generation.ts`: live provider | No |
| `OPENAI_INPUT_USD_PER_MILLION`, `OPENAI_OUTPUT_USD_PER_MILLION` | Generation cost estimates when explicitly configured | No |
| `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_SECRET` | `lib/auth.ts`: live email delivery/code hashing | No |
| `APPLE_CLIENT_ID`, `APPLE_REDIRECT_URI` | Authentication and API: Apple audiences/callback | No |
| `APP_ORIGIN` | HTTP/auth canonical origin | No |
| `CRON_SECRET` | Declared but **unused**; no cron-auth route or autonomous scheduler exists | No |
| `WRANGLER_WRITE_LOGS`, `WRANGLER_LOG_PATH`, `MINIFLARE_REGISTRY_PATH` | Local tool output/state; existing Vite defaults can be overridden by ambient environment | Tool settings only |

See [the plan index](exec-plans/README.md) for later isolation and full verification
work, and [service setup](service-setup.md) for separately scoped live integration.
