# Plan: back pressure (0.16.0)

Approved by the owner on 1 November 2026 (Europe/Berlin). Tracker: [#271](https://github.com/Guccimane44/Vocalbularium/issues/271).

## Outcome

An agent can tell, without the owner, whether its change looks right and whether a module writes well, and the language expansion can run one language at a time until a single gate passes. Today the automated checks cover structure and behaviour (types, unit and browser tests, prompt snapshots, catalog conformance, contrast, the OpenAPI drift check). The owner is still the check for three things: how the interface looks, whether generated content is good, and a third of the JavaScript, which is untyped. 0.16.0 builds checks for each, following [*Don't waste your back pressure*](https://banay.me/dont-waste-your-backpressure/): every routine check an agent can run itself is owner time freed for design.

Nothing a user sees changes. Audio quality is out of scope: the owner trusts the speech provider (1 November 2026).

## Increments

Each increment is one PR against `main`, merged when its CI is green. A, B and F can run in parallel; C, D and E follow in order.

### A. Screens and visual diffs

- **Screen catalogue** (`tests/screens/`): every screen in a fixed state, from fixtures with the controlled text and fake speech providers. Covers the dashboard, a deck, a page with German, Chinese, Expertise and Pronunciation cards (complete, loading, failed), the facet window, the module window, family, module and facet pages, deck settings, the account menu, sign-in, and the empty states. Each is captured in light and dark and in every interface language, with a fixed clock, animations finished and system fonts.
- **`npm run screens`** captures the catalogue and writes a report (`.data/screens/<time>/index.html`). The report shows each screen beside its baseline, a diff image, and the changed-pixel ratio. `npm run screens -- --base main` captures `main` and the working tree and compares them, so an agent sees exactly what its change did to every screen.
- **Baselines** are rendered on Linux in CI, where fonts are stable, and kept as a CI artifact of the last green `main`. A PR's job compares against them and attaches the report. A change beyond the threshold fails unless the PR is labelled `screens-changed`; that label makes the report the review packet's screenshots.

### B. Layout rules

Deterministic checks run on every captured screen, independent of the operating system, each failing with the element and the rule it broke:

- no text overflows or is clipped in its box, except where the design truncates with an ellipsis;
- nothing extends past the viewport horizontally;
- interactive targets are at least 24 × 24 px, and the focus ring is visible;
- in Arabic, the page's landmarks (sidebar, module window, card tabs, menus) mirror their left-to-right positions;
- no English catalogue string appears on a screen in another language;
- every computed colour, border and shadow comes from the design tokens (`extension/design/tokens.json`).

Each UI correction the owner makes from now on adds a rule or a case here, so taste accumulates as checks.

### C. Content checks in the catalog

A facet may define `checks` in its `facet.ts`: deterministic tests of one generated part, which the golden-set runner and the gate apply to every output. Each failure names the facet and the rule. The first checks:

- **Every Languages part:** the text is in the module's script (Latin for German, Han for Chinese), and a translation is not the key repeated.
- **German:** the Article's article matches *der/die/das*, with a plural form; Conjugation and Declension tables are complete for their part of speech.
- **Chinese:** every pinyin syllable is valid and tone-marked, and the count matches the Han characters it reads.
- **Expertise:** a formula has no digits or relational signs; a Python example parses (`python3 -m py_compile`).

A new language brings its own checks in its folder. The [expansion](#not-in-this-milestone) specification will say which are required.

### D. A judge, calibrated first

- **Rubrics** (`rubric.md` beside each module's `module.prompt.md`, and beside a facet's `prompt.md` where it needs its own): a few criteria, each scored *pass*, *weak* or *fail* with a reason. Examples: correct sense for the Context, natural in the language, register right for a learner, the facet actually applies.
- **`npm run judge -- <module> [language]`** runs the golden set live, applies the content checks, asks the judge model to score every card against its rubric, and writes `.data/judge/<time>.md` and `.json`.
- **Calibration before trust.** `tests/golden/calibration/` holds cards whose verdicts are known: the failures and passes recorded in the owner-accepted reviews (`docs/history/evidence/one-request-review.md`, `expertise-writing-review.md`, `module-pages-review.md`, the golden reviews in `.data/golden/`). `npm run judge -- --calibrate` scores them. The judge's verdicts count only once it agrees with the recorded verdicts on at least 90% of the cards and catches every recorded *fail*. Below that, the rubric is revised.

### E. The language gate

`npm run gate -- <module>` is one command with one verdict. It runs:

1. that module's catalog conformance, localisation and prompt-snapshot tests;
2. its golden set with the content checks;
3. the calibrated judge, against a threshold (no *fail*, at most 10% *weak*).

It writes one report, `.data/gates/<module>-<time>.md`. The Verify skill gains a loop recipe for it: run the gate, fix the cause of each failure, rerun; stop after a set number of rounds or when a failure repeats unchanged, and report. Every Languages module passes the gate at the end of 0.16.0; German and Chinese are the first.

### F. Types everywhere

[#199](https://github.com/Guccimane44/Vocalbularium/issues/199) completed: every JavaScript file under `src/`, `extension/`, `scripts/` and `tests/helpers/` is type-checked (`// @ts-check` or the project's `checkJs`), with no new `any` except at untyped library edges.

### G. Verification and delivery

The full suites, CI green, the screens report and both gates attached to the review packet, and a 0.16.0 candidate.

## Acceptance criteria

1. `npm run screens -- --base main` on a branch that moves one card's padding reports exactly the screens with that card as changed, with diff images.
2. Each layout rule fails on a deliberately broken fixture (an overflowing label, an unmirrored Arabic sidebar, a raw hex colour, an English string in French) and passes on `main`.
3. Each content check fails on a recorded bad output (a wrong German article, a toneless pinyin syllable, a formula with digits) and passes on a good one.
4. On the calibration set, the judge agrees on at least 90% of the cards and catches every recorded *fail*.
5. `npm run gate -- german` and `npm run gate -- chinese` pass and write their report.
6. The type checker covers every JavaScript file in the scope of F.
7. A PR's CI attaches the screens report, and fails on an unlabelled visual change.

## Owner decisions

Answered by the owner on 1 November 2026:

1. **The judge model** is the generator's, `deepseek-v4.1-flash` through OpenCode Go, with the existing key. No new provider or key.
2. **Budget:** live judge and gate runs happen when a module's prompts or rubric change, or a language is added, with one sample per golden input. Ordinary commits run only the free checks (A, B, C and F).
3. **Screen scope:** the full matrix, every screen in both themes and all six interface languages, on every PR.

## Risks

- **CI time.** The full matrix adds an estimated 5–10 minutes to each PR; the captures run in their own CI job, in parallel with the existing suites.
- **Pixel noise.** Anti-aliasing and font hinting make pixel diffs flaky; the baselines are Linux-only and the threshold is tuned on `main` before the check can fail a PR.
- **A judge that flatters.** The judge is the generator's own model, so it may share its blind spots. Calibration on recorded failures is the guard: the judge must catch every recorded *fail* before its verdicts count. If it cannot, the plan returns to the owner with the cases it missed.
- **Rubrics as taste.** The first rubrics are drafts; the owner reviews them once, in the packet.

## Not in this milestone

Audio checks; refinement of the product (0.17.0); the language expansion and its specification, which follow 0.17.0.
