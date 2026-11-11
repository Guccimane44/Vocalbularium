# Experiment: reasoning effort on the silver set

10 November 2026. Question: **does turning down the model's reasoning effort degrade the cards, and does it speed up generation?** The reasoning effort is the one variable; quality and speed are measured on their own.

## Setup

- **Silver set** (`tests/golden/silver/silver.json`): 33 cards, a tenth of the golden set's 329, with at least one card from every content module and each kind of hard case. Every pick names a golden input, so its expectation comes from the golden file.
- **Levels**: `default` (no `reasoning_effort` sent, as the product does today), `none` (thinking off), `low`, `high`, `max`, sent to deepseek-v4.1-flash through OpenCode Go. The service rejects an unknown value, so the levels are applied, not ignored.
- **Run**: `npm run silver`, one sample per card and level, the 165 jobs shuffled so a slow spell of the service falls on every level alike, 4 at a time.
- **Quality**: generation errors, unexpected flags and content checks as in the golden set (each counts as a fail), then the judge against the module's `rubric.md`. The judge always runs at the default reasoning, so the measure stays the same. Pronunciation has no rubric, so its two cards are left unjudged.
- **Speed**: each request's time and tokens, as the service reports them.

Raw results: `.data/silver/2026-11-09T23-22-23-110Z.{json,md}` (local, not committed).

## Results

| Level | Pass | Weak | Fail | of which errors | Median time | p90 time | Median output tokens | Median reasoning tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| default | 21 (64%) | 3 | 6 | 2 | 17.7 s | 53.0 s | 1776 | 1533 |
| none | 11 (33%) | 4 | 16 | 2 | 3.0 s | 5.2 s | 208 | 0 |
| low | 26 (79%) | 3 | 1 | 0 | 16.8 s | 35.7 s | 1685 | 1275 |
| high | 26 (79%) | 4 | 1 | 1 | 21.2 s | 57.9 s | 2107 | 1852 |
| max | 21 (64%) | 1 | 9 | 9 | 37.3 s | 87.5 s | 3341 | 3266 |

Each level also has 2–3 unjudged cards, the two Pronunciation cards and any the judge could not score.

Paired card by card against `default`:

| Level | Median time vs default | Better | Same | Worse |
| --- | ---: | ---: | ---: | ---: |
| none | 16% | 1 | 15 | 14 |
| low | 89% | 8 | 19 | 2 |
| high | 113% | 8 | 17 | 5 |
| max | 145% | 4 | 21 | 5 |

## Reading

1. **Thinking off (`none`) is about six times faster and clearly worse.** The median card takes 3 s instead of 18 s, but the pass share halves and 14 of 30 paired cards get worse (one gets better). The failures are the hard cases: a Context's sense, German verb forms, Chinese grammar and English spelling. Creativity, Expertise and names mostly still pass. Not usable for every module as it stands.
2. **`low` costs no measurable quality but saves little time.** The median is 11% faster than default and the tail is shorter (p90 36 s against 53 s), while quality is the same or better (8 cards better, 2 worse). With one sample per card this means no degradation was detected; it does not show that `low` is better. Most of a card's time is the reasoning itself, and `low` cuts it by only about a sixth.
3. **`default` behaves like `high`.** Their tokens and times are close. Default's 6 fails against 1 for low and high are within one sample's noise: two were invalid JSON and the rest were judged on single cards.
4. **`max` is slower and fails on length.** 9 of its 33 cards stopped before finishing (`provider_incomplete`). Its reasoning used up the request's `max_tokens`, as it did for one `high` card. Of the cards that finished, 21 of 24 passed. Its quality is therefore understated, but at about 1.5 times default's time it is not worth pursuing.

## Rerun: default against low, three samples

`npm run silver -- --levels default,low --samples 3`: 99 cards per level (`.data/silver/2026-11-10T00-08-41-495Z.{json,md}`).

| Level | Pass | Weak | Fail | of which errors | Pass, judged cards | Median time | Mean time | p90 time | Median reasoning tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| default | 70 (71%) | 12 | 9 | 7 (4 out of tokens, 2 invalid JSON, 1 bad format) | 75% ± 9 | 16.1 s | 27.8 s | 67.7 s | 1318 |
| low | 65 (66%) | 18 | 9 | 1 | 70% ± 9 | 15.2 s | 17.9 s | 35.8 s | 1215 |

The ± is a 95% interval. Card by card, low did worse than default 22 times and better 15 times, out of 91 pairs. Over the 33 cards, low passed more often on 9 and default on 13. The paired median time is 72% of default's.

- **Quality: no clear difference.** The first run's lead for low did not repeat. Both pass shares fall within each other's interval, and low leans slightly worse, mostly towards weak (18 against 12) rather than fail.
- **Speed: the tail, not the median.** A typical card is barely faster (15 s against 16 s), but the slow cards are much faster: p90 halves to 36 s and the mean drops by a third.
- **Fewer failed requests.** Default ran out of tokens 4 times in 99, low never. Users see those failures as cards to Retry.

**Answer:** lowering the effort speeds generation up only when thinking goes off entirely, and that is when quality drops. From default to `low`, the quality loss stays within noise, with a slight lean towards weak cards. The typical card is no faster, but the slow cards are about twice as fast and rarely fail on length.

## Limits

- The first run had one sample per card and level, and the rerun three for default and low only. `high` and `max` were sampled once.
- The judge's verdicts count only for the modules calibrated so far: Chinese, Computer science, German and Mathematics. In those, low and default both passed 11 of 14 (79%) and 9 of 12 (75%).
- Times were measured with 4 requests at a time on the shared service. They compare levels with each other, not with what one user's card takes.
- The product is unchanged. `OpenCodeProvider` accepts a `reasoning` option, but the server does not set it.

## Possible follow-ups

- Owner decision: whether the shorter tail and fewer out-of-token failures from `low` are worth a slight lean towards weak cards. If yes, the server sets `reasoning: 'low'`, and each module passes its gate at that level before it ships.
- Try `none` for the modules where it held up (Creativity, Expertise, Pronunciation): the cards become near-instant. This needs a per-module setting and that module's gate.
