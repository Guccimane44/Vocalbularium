# Screens and visual diffs

`npm run screens` captures every screen of the extension in a fixed state and
compares it with a baseline, so a change shows exactly which screens it moved
([0.16.0 plan, increment A](../plans/backpressure.md#a-screens-and-visual-diffs)).

## The catalogue

`tests/screens/catalogue.mjs` lists the screens; `tests/screens/fixtures.mjs`
fills a disposable account for them through the store, with each module's
English catalog samples as its cards, the controlled text provider (nothing
generates) and a fake speech provider that speaks a second of silence. Each
screen is captured in light and dark and in the six interface languages as
`<screen>-<theme>-<language>.png`, with the clock fixed at 15 June 2026 12:00
UTC, every page made an hour before, animations finished and the view grown to
the whole screen (an open sheet included). Sign-in is English only: signed out
there is no account to give a language.

| Screen | State |
| --- | --- |
| `sign-in` | signed out |
| `dashboard-empty` | a new account, no pages |
| `dashboard`, `account-menu`, `language-list` | the filled account; the menu and its Language list open |
| `deck`, `deck-empty` | My Deck's 13 pages; Reading list without pages |
| `deck-settings`, `deck-new` | My Deck's settings; a new deck |
| `page-<group>-<state>` | German, Chinese, Expertise (Mathematics and Computer Science) and Pronunciation cards, each `complete`, `loading` and `failed` |
| `page-menu` | German's complete page with its ⋯ menu open |
| `facet-grip` | German's complete page with a facet's grip focused |
| `page-new` | a page made by hand, its cards waiting for Generate |
| `facet-window` | German's facet window |
| `module-window` | every family of the module window open |
| `family-page`, `module-page`, `facet-page` | Languages, German and Article in the pages' sheet |
| `diagnostics` | diagnostic logs |

A new screen is one entry in the catalogue: its route, an element that shows it
has loaded, and the steps that open it. Entries find elements by structure, never
by text, so every language opens the same way.

## Running it

```bash
npm run screens -- --base main
```

captures `main` in a temporary worktree and the working tree, and writes
`.data/screens/<time>/index.html`: changed screens first, each with its
baseline, this capture and a diff image, then every other capture. This is how
an agent sees what its change did; it needs the PostgreSQL test role of the
[Verify skill](../../.agents/skills/vocabularium-verify/SKILL.md). Without
`--base` it compares with `.data/screens/baseline/`, which `--update` writes.
`--only <regex>`, `--languages en,ar` and `--themes light` narrow a run.

The API runs on port 4341 (`--port` or `SCREENS_PORT`), never the owner's 4318.
The extension is built into a temporary folder; `artifacts/extension` is left as
it was. The account menu shows the API's origin, so both sides of a comparison
use the same port.

The run fails on a capture error, a layout violation, or a screen whose share
of changed pixels is over the threshold (0.001 %, about 13 pixels of a 1280 × 1000 screen; `--threshold`). Pixels count as
changed past pixelmatch's colour distance 0.1, anti-aliasing left out; a screen
whose size changed always counts.

## Layout rules

When `tests/screens/rules/index.mjs` exists (increment B), every capture calls its
`checkLayout(page, { screen, theme, language })`; the report lists the violations
per screen and any violation fails the run.

## In CI

The `screens` job in `.github/workflows/verify.yml` captures the full matrix on
Linux, parallel to the other jobs. A push to `main` uploads its captures as the
`screens-baseline` artifact. A pull request downloads the baseline of the last
green `main` run (or, when none is kept, captures its base branch as well),
compares, and uploads `screens-report`. A changed screen fails the job unless the
pull request carries the label `screens-changed`; the job reads the labels when it
runs, so after labelling, re-run it. That report is the review packet's
screenshots. Baselines come from CI only: fonts differ between macOS and Linux,
so compare local work with `--base`.

The threshold was tuned on unchanged `main` (November 2026): in two CI runs on
Linux and one run on macOS, all 326 captures of the same interface matched pixel for
pixel once chance was seeded (a new deck's colour is random). Moving one card's
padding by 8 px changed 0.02 % to 0.2 % of each screen showing that card, and no
other screen. The CI job takes about 7 minutes when it captures both sides and about
4 with a kept baseline, in parallel with the PostgreSQL suites.
