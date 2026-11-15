# M8 trial: Claude Haiku against DeepSeek, judged by Claude Opus

Run 14 November 2026 from `main` after PR 311, as the trial of the [M8 plan](../plans/m8-haiku-deepseek-opus-judge.md). It led to [D36](../../architecture/decisions/d36.md).

## Setup

- **Inputs:** 8 of the 54 language golden inputs (`tests/golden/parents.json`), each through German, Chinese and English: *bank* with a river Context, 一举两得, *laufen*, *Der Zug ist schon abgefahren.*, *aufstehen*, 经济, *Tollpatsch*, *get up*. 24 cards per model.
- **Generators:** `deepseek-v4.1-flash` and `claude-haiku-5-5` through OpenCode Go, default reasoning, one sample each, the product's own composer, adapter and `runCard`.
- **Judges:** Claude Opus 5.5 in a Claude Code session, three fresh subagents (one per module) with `scripts/judge.md` and each module's `rubric.md`, the cards shuffled and the models' names hidden; and DeepSeek through `scripts/judge.mjs` on the same cards. Neither judge was calibrated for this run.
- Nothing mocked. Outputs in `.data/m8/` and `.data/judge/` (not committed); a review deck, *M8 trial: Haiku and DeepSeek, Opus judge*, in the owner's dev database.

## Results

| | DeepSeek | Haiku |
| --- | ---: | ---: |
| Cards returned | 22 of 24 | 24 of 24 |
| Cards failing a content check | 0 | 0 |
| Median time a card | 37.5 s | 8.5 s |
| Cost of the 24 inputs | 58,218 µ$ | 32,015 µ$ |
| Opus: pass / weak / fail | 14 / 8 / 0 | 14 / 9 / 1 |
| DeepSeek judge: pass / weak / fail | 20 / 2 / 0 | 14 / 5 / 5 |

DeepSeek's two missing cards were *aufstehen* in German and English (incomplete replies). Cost per card is not reported because the inputs ran in parallel against one meter.

- **Haiku's Opus fail:** the English card for *aufstehen*: its Etymology traced the German word, not *get up*. DeepSeek's judge failed it too.
- **DeepSeek's judge on Haiku:** four Chinese fails: 一举两得's source given as 《战国策》 (Opus: weak), 醒来 for *get up* (Opus: weak), 经济 glossed as 有好处 (Opus: no fault there), and *zhàn qǐ lai* as a pinyin error, which is not one: 来 after 起 is usually neutral.
- **The two judges** named mostly the same faults; DeepSeek called fail what Opus called weak on Haiku's cards, and called pass what Opus called weak on its own.

## Limits

Eight inputs; one sample; no calibrated judge; Opus and Haiku are from one family, so Opus may favour Haiku; Expertise, Creativity and Pronunciation not run.
