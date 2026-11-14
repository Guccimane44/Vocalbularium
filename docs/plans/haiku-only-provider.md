# Claude Haiku 5.5 as the only model

Drafted 14 November 2026 for the owner's review. Status: **approved by the owner, 14 November 2026**; carried out in [D36](../architecture/decisions/d36.md).

## Decision

The owner, 14 November 2026, after M6 and the [M8 trial](m8-haiku-deepseek-opus-judge.md): `claude-haiku-5-5` through OpenCode Go becomes the product's only model, for generation and for the gate's judge. DeepSeek is no longer used anywhere. No further evidence is gathered before the switch.

Why, in short: under an independent judge (Opus) Haiku's cards are level with DeepSeek's; Haiku returned every card in M6 and M8 where DeepSeek dropped some; it is about 4–5 times faster (8 s against 40 s a card) and about half the cost.

This sets aside two earlier rules, and the decision record says so:
- [K28](../architecture/decisions/clarifications.md#k28) and C8: a model switch needs its own golden-set review. The owner waives it for this switch; M6 and M8 stand in for it.
- The gate's judge counts only once calibrated for its model. Haiku as judge needs one calibration run (step 3). That run is the gate's own mechanism, not new evidence, and costs well under a dollar.

Unchanged: OpenCode Go stays the only provider and stays development-only ([K4](../architecture/decisions/clarifications.md#k4)); one pinned model at a time (Q46); no automatic fallback.

## Changes

1. **The model.** `DEFAULT_MODEL` in `src/server/opencode.mjs` becomes `claude-haiku-5-5`; `.env.example` sets `OPENCODE_MODEL=claude-haiku-5-5`. The timeout note in `src/server/provider.mjs` gives Haiku's time; the three-minute limit stays. The JSON repairs in `provider.mjs` stay: they are harmless, and Luna and GLM needed them too. Their comments no longer name DeepSeek as the reason.
2. **Tests.** `tests/opencode.test.mjs` and `tests/judge.test.mjs` use Haiku where they name the product's model. Prompt snapshots (`tests/prompts/*.txt`) don't change: the model is not in the prompt.
3. **The judge.** `judgeModel` already falls back to the generator's model, so with no `JUDGE_MODEL` the judge is Haiku. Run `npm run judge -- --calibrate` once for every module with a rubric. If Haiku doesn't reach 90 % or misses an expected fail on a module, stop and bring it to the owner: the choice is then a looser calibration rule or a different judge, not more model trials.
4. **Docs.** Name Haiku where the current product's model is stated: `README.md`, `docs/architecture/generation.md` (examples of the stored model), and K28's note. The questionnaire keeps DeepSeek: it records the state when it was asked. History, evidence and earlier plans keep DeepSeek, since they record what ran then.
5. **Decision record.** `docs/architecture/decisions/d36.md`, linked from the traceability map, citing M6 and M8 and the two rules set aside. The same decision in the Notion hub's decision history.
6. **Release.** Joins 0.16.5, whose upgrade note already exists. Its [upgrade note](../product/scope.md#upgrade-from-earlier-builds): no migration. Existing cards keep the model they were written with (stored per facet, K27); a Retry or a new card uses Haiku. The owner's `.env`, if it sets `OPENCODE_MODEL=deepseek-v4.1-flash`, must drop that line or set Haiku, or it keeps overriding the default. The release notes say so.

**Result (14 November 2026):** Haiku's first calibration (14 November 2026, 171 of 177, 97 %) passed for Chinese, Computer Science, Mathematics, Joke, Modern Haiku and Traditional Haiku. It missed expected fails on German (2), English (1) and Chemistry (1): two were replies it could not score, two were faults it marked weak (*Frontend* as a chemistry term, synonyms that don't fit *break the ice*). The owner accepted this as it is: until a later calibration passes, the gate's Judge step reports those three modules as not calibrated, and their gate does not pass.

## Checks

- Offline: the full test suite, `npm run openapi` drift check (no API change expected).
- One live smoke: capture one word in the extension, see the card complete on Haiku, and its stored model read `claude-haiku-5-5`. This checks the integrated path, not quality.
- The calibration run in step 3.

No golden-set or gate runs for quality, by the owner's decision.

## Known slips to watch

From M8, not fixed here: on a key in another language, Haiku's English Etymology described the German word (*aufstehen*) instead of the English one; in Chinese it gave a doubtful source for 一举两得 and 醒来 for *get up*. These go to the prompts when the owner sees them in use.

## Questions for the owner

1. ~~Is Haiku also the judge?~~ **Answered (owner, 14 November 2026): yes, Haiku judges.** The risk that a model scores its own cards kindly is accepted; DeepSeek did the same until now.
2. ~~An M8 evidence note?~~ **Answered (owner, 14 November 2026): yes,** [m8-haiku-deepseek-trial.md](../history/evidence/m8-haiku-deepseek-trial.md).
