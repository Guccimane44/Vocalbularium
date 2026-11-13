# M3: what each part of a card costs

Run 11–12 November 2026, following the [M3 plan](../../plans/m3-cost-per-facet.md), Phase 1 of the [split facets plan](../../plans/split-facets.md). Costs are in millionths of a dollar (µ$) per card or per request, from the provider's `list_cost`.

## Summary

- **The split as it would ship costs about what today's request costs.** Over the 42 part-2 inputs, compared with today's request on the same inputs (M2's arm A, run the day before):

  | | German | Chinese | English (US) |
  | --- | --- | --- | --- |
  | Change in cost | +5 % | +7 % | −15 % |

  All three are inside the bar of at most +10 %, but German and Chinese only just. The configuration is the core at the default reasoning, the facets at `low`, Synonyms and Antonyms in one request, and the prompts as committed.
- **The same configuration costs 10–12 % more than M2's arm C did on the same inputs, in German and Chinese.** Chinese's prompts didn't change at all, so this is mostly variation between runs: every facet request reasoned longer this time. **A difference of about 10 % in cost between two runs is noise**, and it is the size of the margin to the bar.
- **Today's cost can't be divided by part.** Reasoning is 70–79 % of today's card, and nothing says which part it goes to. Without reasoning, today's parts cost 30–250 µ$ each; the core is the largest.
- **In the split, every request costs at least about 150 µ$, even a short one.** Each carries 420–650 tokens of input and reasons for at least 100–200 tokens. So a facet that is small today (Pronunciation, Article) costs 150–270 µ$ as its own request.
- **The most expensive parts of a split card are:**
  - the core (290–390 µ$);
  - Synonyms and Antonyms together (410–590 µ$ per request);
  - Etymology (320–470 µ$);
  - German Declension (440 µ$).
- **Empty facets cost about two thirds of a full one.** A third of the Etymology requests in Chinese and English came back empty, at about 210–300 µ$ each. Today, leaving a facet out costs only its prompt.
- **Writing Synonyms and Antonyms together** is cheaper than two requests in English (412 µ$ against 551 µ$), and dearer in German (588 µ$ against 491 µ$). Its reasoning is longer than either alone.
- **`low` reasoning saves 20–40 % on most facet requests** against the default (M2's B against C), most on Synonyms, Grammar Teacher and Declension. Etymology is the one where it costs quality: it never failed at the default reasoning, and failed with an invalid result 9 times at `low`: 3 in M2, 4 in the rerun and 2 here.

**Quality of the split as it would ship:**

| | German | Chinese | English (US) |
| --- | --- | --- | --- |
| Judge (pass / weak / fail), split | 25 / 7 / 9 ✓ | 29 / 9 / 4 ≈ | 27 / 2 / 13 ✗ |
| Judge, today | 22 / 13 / 7 | 31 / 6 / 5 | 33 / 3 / 6 |
| Compared card by card with today (better / same / worse) | 11 / 20 / 11 | 9 / 22 / 11 | 4 / 27 / 11 |

German has 1 card unjudged.

- **German holds without the restraint sentence.** Declension and Article are now missing on none of the cards, against 1 each today.
- **Chinese is about today's level.**
- **English (US) is worse, for one main reason.** For an English selection, the Pronunciation facet written alone gives the American or plainer form instead of the selection:
  - *colour* gives *color*;
  - *The team are playing* gives *The team is playing*;
  - *bank* gives *riverbank*;
  - *get up* gives *stand up*.

  The facet's own prompt says to speak the selection exactly. The module's rule, to write American English, seems to win when the request has nothing else in it. The content check `english-key-spoken` catches these. Today's request made this mistake on one card, and the split on five. The other English failures are two invalid Etymology results, which fail the whole card in this runner (in the product only that facet would fail), and a few wrong examples.

## What I recommend

1. **Give English the same kind of fix German got.** Add a `facets.prompt.md` for English (US) and English (UK) saying that when the selection is English, every facet quotes and speaks it exactly as selected, its British form included. Then rerun English part 2 (about 15 minutes) before the decision.
2. **Treat the cost as at the bar, not under it.** German and Chinese are within 5–7 % of today, with run-to-run noise of about 10 %. The split's case is its time, 30–46 % faster in the rerun, at about the same cost. It isn't a saving.
3. **Keep Etymology at the default reasoning, or retry it once on an invalid result.** It is the only facet that failed, and only at `low`.

## Per part

Mean cost per request, and per card (the request's cost times how often it is called for). Today's figure leaves out reasoning, which isn't divided; its line is shown separately.

### German

| Part | Today, without reasoning | Split, default (M2 B) | Split, `low` (M2 C) | As it would ship: per request | per card | empty |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Core | 241 | 444 | 394 | 387 | 387 | |
| Article | 29 | 231 | 191 | 193 | 92 | 0 of 20 |
| Examples | 81 | 221 | 186 | 259 | 259 | |
| Synonyms + Antonyms | 46 + 27 | 507 + 219 | 308 + 183 | 588 | 476 | 5 of 34 |
| Conjugation | 86 | 406 | 409 | 303 | 50 | 0 of 7 |
| Declension | 117 | 558 | 355 | 439 | 241 | 0 of 23 |
| Comparison | 30 | 90 | 92 | 139 | 10 | 1 of 3 |
| Case | 40 | 266 | 178 | 263 | 13 | 0 of 2 |
| Pronunciation | 49 | 255 | 202 | 266 | 266 | |
| Etymology | 142 | 636 | 495 | 471 | 381 | 3 of 34 |
| Simple Translation | 85 | 242 | 234 | 281 | 281 | |
| Grammar Teacher | 127 | 530 | 376 | 384 | 146 | 0 of 16 |
| Reasoning, whole card | 2,794 | | | | | |
| **Card** | **3,853** (M1), **2,477** (M2 A) | 2,965 | 2,312 | | **2,601** | |

### Chinese

| Part | Today, without reasoning | Split, default | Split, `low` | As it would ship: per request | per card | empty |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Core | 217 | 236 | 277 | 292 | 292 | |
| Pinyin | 70 | 289 | 213 | 200 | 200 | |
| Examples | 106 | 224 | 203 | 220 | 220 | |
| Pronunciation | 41 | 170 | 151 | 166 | 166 | |
| Etymology | 119 | 427 | 311 | 340 | 275 | 11 of 34 |
| Simple Translation | 83 | 186 | 167 | 189 | 189 | |
| Grammar Teacher | 76 | 298 | 293 | 312 | 45 | 0 of 6 |
| Reasoning, whole card | 1,732 | | | | | |
| **Card** | **2,480** (M1), **1,298** (M2 A) | 1,495 | 1,283 | | **1,386** | |

### English (US)

| Part | Today, without reasoning | Split, default | Split, `low` | As it would ship: per request | per card | empty |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Core | 218 | 368 | 358 | 363 | 363 | |
| Examples | 83 | 210 | 210 | 221 | 221 | |
| Synonyms + Antonyms | 46 + 28 | 612 + 207 | 344 + 207 | 412 | 333 | 3 of 34 |
| Pronunciation | 50 | 144 | 142 | 147 | 147 | |
| Etymology | 124 | 490 | 361 | 317 | 242 | 12 of 32 (2 failed) |
| Simple Translation | 62 | 168 | 159 | 170 | 170 | |
| Grammar Teacher | 112 | 320 | 303 | 291 | 132 | 0 of 19 |
| Reasoning, whole card | 3,235 | | | | | |
| **Card** | **4,112** (M1), **1,925** (M2 A) | 2,075 | 1,727 | | **1,640** | |

M1's card costs are higher than M2's A: M1 ran on a different set of inputs, with no cached input. The comparisons above use M2's A, which ran on the same inputs as the split.

## What was run

| | |
| --- | --- |
| Confirmation run | The 42 part-2 inputs of M2, through German, Chinese and English (US), one sample, 8 cards at a time: the core at the default reasoning, the facets at `low`, Synonyms and Antonyms in one request (`--pair`), the prompts as committed in 91e6f04. Then the judge |
| Today's figures | M1's 242 requests, divided by part as in M1 (input and visible output by characters, at about $0.26 and $0.97 per million tokens); M2's arm A for whole cards |
| Split figures | Measured per request: M2's arms B and C, and the confirmation run |
| Mocked | Nothing. Runner `.data/m2/run.mjs` with `--pair`, analysis `.data/m3/analyze.py`, not committed |
| Kept | `.data/m3/run-2026-11-11/`, `.data/m3/combined/` (with M2's part-2 A and C for comparison), `.data/m3/analysis.json` |
| Judge timeouts | 11 cards timed out at the judge and were judged again; 1 German card still timed out |

## Limits

- **One sample per input, and runs on different days.** The same configuration cost 10–12 % more in this run than in M2 for German and Chinese. Each cost comparison carries about that much noise.
- **Today's reasoning isn't divided by part** (owner's question 2, left as drafted).
- **English (US) has no calibrated judge.** Its Pronunciation finding is also caught by the content check, which doesn't depend on the judge.
- **The confirmation run used 8 cards at a time,** not 4 as in M2, to finish faster. No request was refused for rate limits. Time wasn't measured.
- **English (UK) wasn't run.**
