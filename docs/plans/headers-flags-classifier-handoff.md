# Handoff: catalog cleanup, a classifier before generation, and dictionary lookup

Written 10 November 2026 for a new session. It records what the owner asked for, what was found, what was drafted, and what is still open. Nothing here is decided, no product code was changed, nothing was run against Jev, and nothing is committed.

## What the owner asked for

The owner is reworking the module, core and facet definitions in three steps:

1. **Clean up.** Delete fields the product no longer needs: `provider` and `source` on a module, `label` and `output` on a core. The owner also finds the module, core and facet schema more complicated than it should be. Their example: `romanization` in the Chinese module overlaps the Pinyin facet.
2. **Move classifications from the text model to Jev** (TypeSafe AI), so they are known before generation.
3. **Skip generation where a Wiktionary lookup can do the job**, above all for costly facets such as the declension table. The owner expects this to need a new architecture and wants to iterate on it.

The owner works in this order: refine, readiness analysis, plan, iterate, execute. Drafts go to the owner before anything is run. Ask the owner about any ambiguity rather than assuming.

## State of the work

| Piece | State |
| --- | --- |
| Evaluation of the cleanup | Delivered in chat, summarised below |
| Evaluation of steps 2 and 3 | Delivered in chat, summarised below |
| Assessment of the golden sets | Delivered in chat, summarised below |
| [Jev experiment plan](jev-flags-experiment.md) | Draft, not approved, not run. Its inputs still name the golden sets and should point at the held-out set |
| [Held-out evaluation sets](../../tests/golden/held-out/README.md) | Draft. Every label is Claude's and unreviewed |
| Deleting the four fields | Not started; the owner has not asked for it yet |
| German lookup coverage experiment | Not planned yet |

The branch `claude/silver-set-reasoning` also carries uncommitted work from an earlier task (the silver set and the reasoning-effort experiment: `scripts/`, `tests/golden/silver/`, `src/server/opencode.mjs`, `tests/catalog.test.mjs` and others). It is unrelated to this handoff. Do not commit or revert it as part of this work.

## Finding 1: the cleanup

All fields are defined in `packages/domain/src/catalog/define.ts`. A search of the whole repository shows the four named fields are dead:

| Field | Who reads it |
| --- | --- |
| Module `provider` (and the type `ProviderKind`) | Nothing |
| Module `source` (and the type `Source`) | Only `tests/catalog.test.mjs`, where it restates `kind` |
| Core `label` (`'Core'` in all eleven cores) | Nothing |
| Core and facet `output` (and the type `OutputType`) | Only one assertion in `tests/catalog.test.mjs` that it equals `'text'` |

Fields with similar names that are in use and must stay: `core.labels` (read by `extension/catalog-text.ts`), `headerLabels` (read by `render.ts`), `instances` (read by `page-modules.ts`).

**Deleting the four is safe as one small change.** It touches no stored data, no API payload and no prompt, so the prompt snapshots in `tests/prompts/` should not move. It needs matching edits in `tests/catalog.test.mjs` and `docs/architecture/generation.md`.

The owner's feeling that the schema is tangled is right, but the tangle is elsewhere:

- **Flags are never declared.** A flag is whatever a core's `header()` happens to return. `ruledOut` in `parents.ts` tests `'relevance' in core`, and `content.ts` hard-codes the header kinds.
- **The contract names module-specific flags.** `ParentHeaderSchema` in `packages/contracts/src/pages.ts` has five variants (word, sentence, expertise, pronunciation, creativity). D25 says the contract names no facet; the header goes against that idea.
- **Applicability is stated four times:** `applies`, `when`, prose in each facet's `prompt.md`, and `appliesTo` in `about.json`.
- **`language` means three things** across modules, and Grammar Teacher matches hard-coded localised language names.
- **The core is stored as markdown and parsed back** by `read()`, and that parser is copied across the four Languages cores.
- **Three near-identical names:** `label`, `labels`, `headerLabels`.

On the owner's example: `romanization` is the reading of the key, and Pinyin is the reading of the Chinese translation. They duplicate each other only when the key itself is Chinese.

**Recommendation:** delete the dead fields now. Reshape flags and the header once, together with step 2, because step 2 changes who writes the flags anyway.

## Finding 2: Jev and lookup

Facts about Jev, gathered from public sources in this session: it is a decision-only model released in September 2026. It answers three question types: Noul (a yes/no probability), Choice (up to 255 options) and Score. The endpoint is `POST https://api.typesafe.ai/v1/systemone` with `model`, `state` and `questions`; the SDK is `@typesafe-ai/sdk`. Reported latency is about 70 to 500 ms and the price $0.042 per million input tokens. It is hosted only, and operation in the EU is not documented. It is reported to prefer English and to be weak on counting, dates and related questions that must agree. `jev-1.14.0` is reported to improve multilingual input. The owner has confirmed they have access; the key is `TYPESAFE_API_KEY` in `.env`.

How well each flag fits Jev:

| Flag | Fit | Why |
| --- | --- | --- |
| Pronunciation `language` | Strong | The whole text-model request is this one classification |
| `kind` (word or sentence) | Good | Decidable from the key alone |
| Key's language, Creativity `language` | Good | Decidable from the key and Context |
| `gramRole` for a German key | Fair | The key's own part of speech is close to today's meaning |
| `gramRole` for a foreign key | Poor | Today it describes the German translation, which exists only after the core is written |
| `relevance`, `hasFormula`, `hasCode`, `hasEquation` | Poor | The text model already got 39 of 39 inline, and knowing them earlier skips nothing |

Lookup fits facets with closed-form answers: German Article, Declension, Conjugation and Comparison. It does not fit explanatory text. The [earlier Wiktionary experiment](../history/evidence/wiktionary-english-experiment.md) supports this: a dictionary-first English card passed 15 of 41 checks against 36 of 41 today, no card skipped the model, and the speed gain came from sending facet requests in parallel (12.2 s against 38.7 s). Cached entries in `.data/wiktionary-2026-11/entries/` already hold German inflection forms.

Two ways the plan should be reframed:

- **Whether a lookup is possible is not a classifier decision.** It is a deterministic check: the entry exists, its table is complete, and the facet's own `checks` pass. Otherwise fall back to generation.
- **The source belongs to a facet or a part of it, not to a module.** That is one more reason the module-level `source` field should go.

What it costs: D17 (one request per module) is partly reversed. The flow becomes classify, then core, then facets in parallel, some looked up and some generated. Open decisions that come with it: how dictionary data is delivered (a local import or a live fetch), CC BY-SA attribution, what Retry means on a looked-up facet, and tracing an inflected key to its headword.

**Suggested order:** delete the dead fields; run two cheap experiments (Jev on the flags, German table coverage in Wiktionary); write one decision that supersedes D17; then design flags, header and sources together.

## Finding 3: the golden sets

The owner asked whether the golden sets are good enough to judge a classifier and a lookup. **Verdict: they are a good regression suite, and not a benchmark for either.**

What is good: each input has a `why`, flags are checked automatically, the Expertise cross-subject cases are designed, Pronunciation has ambiguity pairs, and there are content checks, a calibrated judge and a gate.

What makes them unfit as a benchmark:

- `parents.json` states no language for its 54 keys. Recorded runs gave *tot* as English four times, German twice and Dutch twice, and nothing flagged it.
- `kind` never varied on 38 of the keys, so the set is too easy to tell methods apart.
- The hard cases had their expectations removed (*break the ice*, *Chef*, *half-life*).
- All 43 word keys are headwords except *sich freuen*, and only 6 of 54 inputs have a Context.
- The prompts were tuned on these inputs and quote some of them (*breadcrumb*, *行*, *Ufer*, *Gift*, *Chef*). There is no held-out part.
- One sample of 54 cannot support a threshold, and 49 of 247 German cards in recent runs failed on timeouts or service errors.
- German coverage is thin: 7 nouns, 5 verbs, 3 adjectives, 2 prepositions.

Recommended: keep the golden sets for regression, add expected languages to `parents.json`, stop using golden inputs as prompt examples, and measure the classifier and the lookup on a separate held-out set. The owner approved drafting that set.

## The held-out sets

In `tests/golden/held-out/`, with the rules and known limits in its [README](../../tests/golden/held-out/README.md). No script reads them yet.

- `classification.json`: 247 items in eight strata (headword 30, inflected 33, boundary 45, homograph 38, homograph with Context 28, name-number-code 23, noise 24, part of speech with Context 26). Each item lists every acceptable `kind` and `language`, the likeliest first. 56 items accept more than one language and 16 accept either kind.
- `lookup-german.json`: 139 items. 52 nouns, 43 verbs and 20 adjectives by inflection class, each with the forms that fix its table, plus 24 inflected keys that must first be traced to a headword.

What a new session must know about them:

- **Every label is Claude's draft.** The owner has not reviewed them. The German forms were written from memory and are unchecked against a reference grammar.
- **The boundary stratum encodes a product rule.** *Danke!* and *Stop!* are labelled words and *Rain expected tomorrow* a sentence, following the current prompt's rule that punctuation alone does not make a sentence. If the owner disagrees, the rule changes, not only the label.
- **Part of speech is the key's own**, in its own language. That is not today's `gramRole`.
- *Chef*, *tot* and *gut* also appear in the golden sets without a Context. They were kept because the golden sets state no language for them.
- All items are constructed; none is a real capture.

## Open questions for the owner

1. May keys and Contexts from the owner's own decks be added to the classification set? They would be sent to Jev and to the text model. This was the last question asked and is unanswered.
2. Who reviews the draft labels, and when? The Jev plan should not run before that.
3. Should the reshape of flags and the header be folded into step 2, or done now with the cleanup?
4. On a Chinese card for a Chinese key, where does the reading go: under the key, in the Pinyin facet, or both?
5. May this increment discard decks and pages as D17 did, or must existing cards be migrated?
6. For the Jev plan: the thresholds in its "Proposed reading of the results", and whether to pin `jev-1.14.0` or use the default alias.

## Next steps, in the suggested order

1. Get the owner's answers to questions 1 and 2, then correct the held-out labels and check the German forms against a reference.
2. Point the [Jev plan](jev-flags-experiment.md) at the held-out set instead of the golden sets, and get the plan approved.
3. When the owner asks for it, delete the four dead fields as its own small change.
4. Draft a plan for the German lookup coverage experiment: for each item in `lookup-german.json`, does the cached Wiktionary entry give a complete and correct table?
5. Run the two experiments only after the owner approves each plan.
6. With both results, draft the decision that supersedes D17 and the design of flags, header and sources.

## Constraints that carry over

- Sending anything to Jev is an outward-facing action and needs the owner's go-ahead for that run. Only test inputs go out unless the owner allows deck data.
- `TYPESAFE_API_KEY` is read from `.env` by the script and never printed, logged or written to an output. Note that the line in `.env` has a space before the `=`, which some loaders will not parse.
- Commit or push only when the owner asks.
- Read the Notion hub before product or architecture decisions; decisions D11, D17, D24, D25, D28, D29 and D30 in `docs/architecture/decisions/` are the ones this work touches.

## Where to read

| Topic | File |
| --- | --- |
| Field definitions | `packages/domain/src/catalog/define.ts` |
| Flags, headers and what reads them (the owner's own map) | [maps/headers-and-flags-map.md](../../maps/headers-and-flags-map.md) |
| Applicability | `packages/domain/src/parents.ts` |
| Stored header | `packages/contracts/src/pages.ts` (`ParentHeaderSchema`) |
| One request per module | [D17](../architecture/decisions/d17-one-request.md) and the [generation rounds experiment](../history/evidence/generation-rounds-experiment.md) |
| Earlier dictionary work | [plan](wiktionary-experiment.md) and [evidence](../history/evidence/wiktionary-english-experiment.md) |
| Golden sets and their runner | `tests/golden/`, `scripts/golden-set.mjs`, `scripts/gate.mjs` |
