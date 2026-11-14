# Experiment: the flags from Jev

Draft for the owner's review, 10 November 2026. Nothing here is decided. The experiment answers one question before any architecture is designed: **which of the flags that the text model writes today can Jev decide before generation, as reliably, and how fast from here?**

Background: the [headers and flags map](../../maps/headers-and-flags-map.md) lists the seven flags and what reads them. Each is written today inside the card's single request ([D17](../architecture/decisions/d17-one-request.md)), so nothing can be routed before generation. The [Wiktionary experiment](../history/evidence/wiktionary-english-experiment.md) stood a small model in for Jev; this one uses Jev itself.

## What is compared

| Variant | How a flag is decided |
| --- | --- |
| **A** (today) | The flag as the pinned text model writes it in the card's request. Taken from a fresh golden-set run of each module, so A and J see the same inputs on the same day. |
| **J** (Jev) | One Jev request per input, holding the key and its Context when it has one as `state`, and every question below that applies. No card is generated. |

## Questions asked of Jev

| Flag | Question type | Options | Inputs |
| --- | --- | --- | --- |
| `kind` | Choice | word or phrase, sentence | `parents.json` (54) |
| Key's language | Choice | the 80 ISO 639-1 codes Pronunciation speaks, and `other` | `parents.json` (54), `pronunciation.json` (16), `creativity.json` (12) |
| `gramRole`, the key's own part of speech | Choice | the ten roles German's header names, and `other` | the word keys of `parents.json` |
| `relevance` | Choice, once per subject | subject, neighbouring, unrelated | `mathematics.json` (21), `computer-science.json` (18), `chemistry.json` (22) |
| `hasFormula`, `hasCode`, `hasEquation` | Noul | yes or no | the same three sets, subject keys only |

Two points about these questions:

- **`gramRole` is not the same question as today's.** Today it describes the German word for the first meaning, which exists only once the core is written. Jev is asked for the part of speech of the key in its own language. The experiment reports how often the two agree for foreign keys, which says whether the flag can move before the core at all.
- **`relevance` and the `has…` flags are a control.** The text model decided every case correctly inline in the [generation rounds experiment](../history/evidence/generation-rounds-experiment.md), and no generation is skipped by knowing them earlier. They are asked to learn where Jev's limit is, not because a move is expected.

The wording of each question is taken from the matching sentences of today's core prompts, so the definition of a flag does not change between A and J. One alternative wording per question is run as well, since reviews report that Jev reads questions literally.

## Expected answers

The golden sets already state `kind`, `gramRole` for German, `relevance`, the three `has…` flags, and `language` for Pronunciation and Creativity. `parents.json` states no language for its 54 keys. Those are labelled for this experiment in a file beside the runner, with the reading the input's `why` intends (*gut* and *tot* as German), for the owner to correct before the run.

## What is measured

1. **Accuracy.** Per flag, J and A against the expected answer, and J against A. Listed by input, so every miss can be read.
2. **Confidence.** Whether Jev's misses sit at low confidence: per flag, the threshold above which J makes no error on this set, and the share of inputs above it. This says how many inputs would still fall back to the text model.
3. **Stability.** Every request five times, and once with the options in reverse order: how often the choice changes, and how far its probability moves.
4. **Consistency.** Inputs where Jev's answers contradict each other, such as a sentence with a part of speech.
5. **Language of the question.** For the German and Chinese keys, the same question with the instructions in English only, since Jev is reported to prefer English.
6. **Time.** Wall time per request from this machine, median and slowest, with all questions in one request and with one question per request.

## Proposed reading of the results

To be set by the owner before the run:

- **A flag moves to Jev** if J is at least as accurate as A on it, never changes its choice across the repeated runs for inputs above the threshold, and at least 90 % of inputs are above the threshold.
- **A flag moves with a fallback** if J is as accurate above the threshold but more inputs fall below it: those inputs keep today's path.
- **A flag stays with the text model** otherwise.
- **Worth designing a classification step** if `kind` and the key's language both move, and a request takes about half a second or less from here.

## Out of scope

Product code, a provider adapter, storage, the stored header's shape, the dictionary lookup (its own experiment on the four German grammar facets), and the cleanup of unused catalog fields, which runs on its own.

## Privacy and cost

Only golden-set inputs are sent: test keys and their Contexts, no user content. `TYPESAFE_API_KEY` is read from `.env` and never written to an output or a log. About 150 inputs, twelve requests each including repeats and variants, at well under a thousand tokens per request: a few cents at the published price.

## Output

A runner kept locally in `.data/jev-2026-11/` with every request and answer, an evidence note in `docs/history/evidence/jev-flags-experiment.md`, and a recommendation per flag.

## Open before the run

1. The language labels for the 54 Languages keys, for the owner's correction.
2. The thresholds above.
3. Whether to pin a Jev version (`jev-1.14.0` is reported to improve multilingual input) or use the default alias.
