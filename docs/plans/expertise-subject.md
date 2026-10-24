# Plan: the Expertise modules stay with the subject (0.11.0)

Proposed: 24 October 2026 (Europe/Berlin). Implements [D16](../architecture/traceability-map.md#entries), accepted by the owner on 24 October 2026, with K44–K48 resolved the same day. Specification: [modules § Staying with the subject](../specs/modules.md#staying-with-the-subject). Evidence: the [blind ranking](../history/evidence/expertise-insight-ranking.md) and the [0.10.0 review](../history/evidence/expertise-writing-review.md). Tracker: [#227](https://github.com/Guccimane44/Vocalbularium/issues/227).

## Outcome

An Expertise card explains a key of its subject as in 0.10.0. A technical term of a neighbouring field, such as multi-core in Mathematics, is named as not a concept of the subject and explained in one plain paragraph. An unrelated key, such as retinol, gets one honest sentence in the interface language instead of its general meaning, optionally followed by an established term of the subject built on the word (happy numbers for 幸福 in Mathematics). No answer forces a formula, law or model of the subject onto another field's term. The core no longer restates or explains the Context, and names an everyday meaning only when a supplied Context uses it.

0.11.0 builds on `main` after 0.10.0 and the D16 specification PR [#226](https://github.com/Guccimane44/Vocalbularium/pull/226). It changes only the Computer Science and Mathematics prompts and their golden sets: no migration, no API or interface change, and components generated earlier keep their content and prompt version until regenerated. The minor version marks the change in what the Expertise modules write.

## Owner decisions

Recorded in D16 on 24 October 2026 and applied to the specifications:

1. **No control flow:** one request per module, as now ([D11](../architecture/traceability-map.md#entries)); the model decides the case from the key, the Context and the neighbouring fields its prompt names; no classification step or stored field (K44).
2. **Unrelated keys:** one honest sentence, shown like any core; an established term of the subject in at most one more sentence (K45).
3. **Neighbouring terms:** one paragraph within the module's length, plain, no subject formula unless the subject's textbooks routinely apply it (K46).
4. **Everyday meanings:** any sense outside the subject; named only when a supplied Context uses it, in one opening sentence; etymology only when the subject's textbooks give it (K47).
5. **Verification:** new golden cases, a review in all six languages as in 0.10.0, and the owner's blind ranking of at most eight changed cards against today's output (K48).

## Increments

Each increment is one PR against `main`, reviewed and green in CI before the next starts.

### 0. Record the plan

This plan and the tracker.

### A. The prompts, the golden sets and the owner's ranking

- **Baseline.** Before any prompt changes, run both golden sets with the new inputs below on 0.10.0's prompts, in English, three samples each, and keep the outputs as the comparison (`.data/`, not committed).
- **Prompts.** Rewrite the core prompts in `packages/domain/src/catalog/expertise/{computer-science,mathematics}/facets/core/`:
  - `word.prompt.md`: the three cases of the [spec](../specs/modules.md#staying-with-the-subject), the module's neighbouring fields (Mathematics: computer science, physics, statistics, economics and engineering; Computer Science: mathematics, electronics, linguistics and information science), the honest sentence for an unrelated key, no forced angles, and the Context and everyday-meaning rules. The fallback "say so in one sentence and explain what it means" and "When the selection has an everyday meaning as well" are replaced. A key of the subject keeps today's instruction (what it means, why it matters, a simple example), which the ranking preferred.
  - `sentence.prompt.md`: no forced angles and the Context rule only; how a sentence outside the subject is handled stays as now (see Not in this milestone).
  - The two modules keep one shared wording apart from the subject's name and its neighbouring fields. `{{language}}`, `{{length:50}}` and the writing guides ([D15](../architecture/traceability-map.md#entries)) are unchanged.
- **Golden sets.** `tests/golden/mathematics.json` gains retinol (unrelated), multi-core and cache (neighbouring terms), and 幸福 (unrelated, with happy numbers as the established term); `computer-science.json` gains retinol. The `why` of each existing case follows D16: Frontend in Mathematics is a neighbouring term; 幸福 in Computer Science is unrelated; the grandmother's ring and the corn kernel name the Context's sense in one opening sentence, then the subject's meaning; the algebra ring and the operating-system kernel are explained without restating the Context; limit, field, group, bug, thread and cache in Computer Science are explained in the subject's sense only.
- **Snapshots and tests.** The Expertise prompt snapshots in `tests/prompts/` change, in every language; the German, Chinese and interpretation snapshots stay byte-identical. The Expertise prompt version changes for every language. The unit and browser suites pass unchanged: no UI, storage or API boundary changes, so the existing browser E2E covers the Expertise journey with a mocked provider, and the live provider is exercised only by the golden-set runs.
- **English run.** Both golden sets in English, three samples per input, on `deepseek-v4.1-flash`, checked against each input's `why`; a prompt finding is fixed and the run repeated.
- **Owner's ranking.** On a private judging page like the [ranking's](../history/evidence/expertise-insight-ranking.md), the owner ranks blind, for each card, the new output against the baseline, versions shuffled and revealed afterwards, marking each fine or not fine with an optional note. At most eight cards, the ones D16 changes: in Mathematics retinol, 幸福, multi-core, cache, Frontend and the grandmother's ring; in Computer Science retinol and 幸福. The new prompts are adopted if the new output is preferred or tied on most cards and not marked not fine where the baseline was fine; otherwise the owner decides before B starts. The result is an evidence record.

### B. Review per language (K42, K48)

- **Runs.** Both golden sets in each of the five languages other than English (A's run serves English), three samples per input, through `npm run smoke:generation -- <module> <language> 3`.
- **Review.** A Claude reviewer separate from the drafter reads each language for D16's cases (the honest sentence, the neighbouring paragraph, no forced angles, the Context not restated, no unrequested everyday meaning) as well as for facts, invented terms and the writing guide's conventions. A prompt finding is fixed in the prompt and the affected languages run again; a guide finding is fixed in the guide and that language run again. Each language's result is recorded in `extension/locales/reviews.json`, and the runs are summarised in an evidence record beside the 0.10.0 review. The owner reads Chinese and English.

### C. Verification and delivery (0.11.0)

- The full unit and browser suites; the evidence from A and B.
- Version 0.11.0; a scope ledger row for D16 moved to `implemented`, with an upgrade note (no migration; Expertise output changes for keys outside the subject and for Context cases, earlier components unchanged); D16 to Implemented in the traceability map and Notion. Packaged with the Deliver skill. Owner acceptance is recorded separately.

## Acceptance criteria

1. "retinol" in Mathematics or Computer Science gives one sentence saying it is not a concept of the subject, in the interface language, with no explanation of the vitamin.
2. "multi-core" in Mathematics is named as not a mathematics concept and explained in one plain paragraph, without Amdahl's law or another formula.
3. "幸福" in Mathematics may name happy numbers in one more sentence; in Computer Science it gives the honest sentence only.
4. Keys of the subject, such as derivative and recursion, are explained as in 0.10.0; the owner's ranking does not find them worse.
5. With a Context inside the subject, the core does not restate or explain it; with a Context outside it, the core opens with one sentence naming that sense; without a Context, it gives no everyday meaning.
6. Every interface language has a recorded D16 review; the German, Chinese and interpretation prompts are byte-identical to 0.10.0's.
7. Components generated before 0.11.0 keep their content and prompt version.

## Risks

- **The line between neighbouring and unrelated is the model's:** a key such as entropy may land on either side between samples. Three samples per input show how stable it is; a consistently wrong case is fixed by the prompt's list of fields, not by a classification step.
- **Too terse:** the honest sentence may also cut a key of the subject that looks everyday, such as limit or field. The golden sets keep those cases, and the ranking and the review check them.
- **The honest sentence in six languages** may read as an error message. The review checks that it reads as a plain statement in each language.
- **One owner judging eight cards** is a small sample, as in the ranking; the per-language review adds breadth, not judgement of insight.
- **Live runs cost provider usage:** 39 inputs at three samples are about 120 calls per language run, so about 240 for the baseline and the English run in A, and about 600 for B.

## Not in this milestone

Sentences outside the subject (the sentence prompt keeps its current handling); facets for the Expertise modules; new Expertise modules; a different model; a control flow or relevance field; changes to the writing guides beyond review findings; the Languages modules.
