---
name: vocabularium-drive
description: "Drive the real Vocabularium extension and API the way a user does, and keep screenshots and database rows as evidence. Use to see a change working, to reproduce a vague bug report, or to gather evidence for a PR or review packet. Regression tests stay in tests/browser; this is for looking."
---

# Vocabularium Drive

`npm run drive` starts the real extension in Chromium and the real API on a disposable database, signs in, and lets a journey drive it through the Chrome DevTools Protocol. The **Verify** skill chooses regression checks; this skill is for looking at a change working and keeping proof. The [feature map](features/README.md) says how to drive each feature; the [screen references](../../../docs/screens/README.md) say what a user sees and can do.

Run every command from the repository root. It needs what the browser tests need: PostgreSQL 18 with `.env.postgres` (see the Verify skill's test environment), `npm ci`, and Playwright's Chromium.

## Launch

```bash
npm run drive -- launch
```

Run it in the background: it stays up until `stop`. Ready is the line `Ready: signed in as admin at chrome-extension://…/app.html, API on http://127.0.0.1:4360, …`. Launching:

1. builds its own copy of the extension for its port, leaving `artifacts/extension` and the owner's API on 4318 alone;
2. creates a disposable database (`vocabularium_test_…`), applies every migration and starts the API on it;
3. starts Chromium with the extension, and with DevTools on the next port (4361), opens the app and signs in as `admin`.

Options:

- `--port <n>`: the API port; DevTools takes `n + 1`. The default is 4360. A taken port stops the launch; never stop a process you didn't start.
- `--seed empty`: a new account, with **My Deck** holding Main key, Context and German. This is the default.
- `--seed full`: the screens fixture, with completed, loading and failed pages for every module group, a hand-made page and a second, empty deck.
- `--provider samples`: each module answers with its catalog sample. This is the default, and nothing reaches a model.
- `--provider unavailable`: every generation fails.
- `--headed`: shows the browser window.

## Doctor

```bash
npm run drive -- doctor
```

It reads only, and checks five things: the launch process is alive, the API answers, the API runs the checkout's commit, Chromium answers, and the app page is open. Run it first whenever something looks off. A `FAIL` on `build` means the session runs older code: stop it and launch again.

## Drive

```bash
npm run drive -- run <journey.mjs> [--name <label>]
```

A journey is a module whose default export takes the helpers and drives one feature:

```js
export default async function ({ page, context, app, api, shot, json, query, capture, webPage }) { … }
```

- `page` is the signed-in app tab, and `app` its address. Routes are `#page/<id>`, `#deck/<id>` and `#configure/<id>`.
- `shot(name)` saves a numbered screenshot once running animations have ended (it waits up to 5 seconds); `json(name, value)` saves a value. Motion itself is for `tests/browser/motion.test.mjs`, not screenshots.
- `query(sql, values)` reads the disposable database.
- `webPage()` and `capture(text)` capture a selection as the context menu does.
- The helpers in `tests/browser/helpers.mjs` (`accountMenu`, `facetWindow`, `addFromWindow`, `drag` and others) work on `page` too. The browser is attached over CDP, so `page.viewportSize()` is null until a journey sets one with `page.setViewportSize`; `addFromWindow` needs it.

Use stable handles: roles with their exact names from `extension/locales/en/messages.json`, and the classes the browser tests use. Don't use coordinates or tab order. The browser stays signed in between journeys, so a journey starts from wherever the last one left off: go to the route you need first, and reload to drop what an earlier journey left open. What journeys change stays in the database for the session (a fold even outlives a reload), so write a journey to toggle rather than assume a starting state, and relaunch for a clean seed.

Ready-made journeys are in [journeys/](journeys/), one per mapped feature. Write a new one beside them when a feature has none, and list it in the feature map.

## Evidence

Each run writes `.data/drive/evidence/<time>-<label>/`, which is ignored by git:

- the screenshots it took, in order;
- `end.png`, and `failure.png` when it failed;
- the JSON it saved;
- `journey.json`, with the journey, the commit, the API's commit, the times and the error, if any.

A failed journey exits with 1. The evidence stays after `stop`.

A proof meets four standards:

- **The real user path.** Go through the pages and buttons a user would use, not internal setters.
- **The action and the result.** Show the action and the state it led to, not only the final screen.
- **The side effect.** Show it in the database with `query`, as well as on screen.
- **Mocks only at the provider.** Generation and speech are the only things replaced, by the samples and a silent voice.

For a PR or review packet, attach the screenshots and say which journey and seed made them.

## Stop

```bash
npm run drive -- stop
```

It stops the launch process it recorded in `.data/drive/session.json`, which closes the browser and the API, drops the database and removes the extension copy. It never stops anything by name, and it never removes the evidence.

## Keep the map true

A change to what a user sees or does updates its [screen reference](../../../docs/screens/README.md) in the same PR; a change to how a feature is driven (routes, seeds, helpers) updates its file under [features/](features/README.md). When a journey breaks because the app changed on purpose, fix the journey and its feature file together. A journey that fails because the app is wrong is a bug report, not something to edit away.
