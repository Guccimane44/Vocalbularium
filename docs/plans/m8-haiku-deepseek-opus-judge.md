# M8: Claude Haiku against DeepSeek, judged by Claude Opus

Drafted 14 November 2026 for the owner's review. Status: **approved by the owner as a 48-card trial, 14 November 2026**, with Opus judging in a Claude Code session instead of through OpenCode Zen. Follows M6 (`docs/history/evidence/m6-model-and-setup.md` on `claude/german-tables`), which compared the two models on German only with a DeepSeek judge, and [M7](../history/evidence/m7-luna-gate.md), which gated every module on Luna and DeepSeek.

## Trial (what runs now)

The owner cut the first run to about 50 cards and moved the judge into Claude Code (Opus 5.5), so nothing is spent from a Zen balance and the adapter is unchanged.

- **Inputs:** 8 of the 54 golden inputs, each through German, Chinese and English: *bank* with a river Context, 一举两得, *laufen*, *Der Zug ist schon abgefahren.*, *aufstehen*, 经济, *Tollpatsch*, *get up*. 24 cards per model, 48 in all.
- **Generation:** both models on the same day, with `main` after PR 311, at default reasoning (`.data/m8-run.mjs`, outputs in `.data/m8/`, not committed).
- **Judge:** Opus 5.5 in the session, through fresh subagents that each read `scripts/judge.md` and the module's `rubric.md` and score one batch of cards, model names hidden. Verdicts are saved in the shape `scripts/judge.mjs` writes.
- **Beside it:** DeepSeek's judge on the same 48 cards through `scripts/judge.mjs`, to show how far the two judges disagree.
- **Left out of the trial:** calibration, the blind read, and the full 54-input runs. The sections below are the full experiment, to run only if the trial says it's worth it.

## Question

Is `claude-haiku-5-5` as good as `deepseek-v4.1-flash` on the three language modules, when a judge that is neither of them scores both?

M6 left two gaps:
- **The judge was DeepSeek**, so it may have favoured its own cards. On the 54 standard German inputs it passed 36 DeepSeek cards and 27 Haiku cards, a gap about as large as the judge's own noise.
- **Haiku ran on German only.** Chinese and English, where Luna fell short in M7, were never tried.

If Haiku comes out level, it would give cards in about a fifth of the time (8 s against 42 s for a word card in M6) at a quarter to a half of the cost, with no invalid replies so far.

## Arms

| Arm | Generator | Judge |
| --- | --- | --- |
| **DeepSeek** | `deepseek-v4.1-flash` (today's) | `claude-opus-5-5` |
| **Haiku** | `claude-haiku-5-5` | `claude-opus-5-5` |

Both at their default reasoning, the product's prompts on `main` after [PR 311](https://github.com/Guccimane44/Vocalbularium/pull/311), one sample per input, all three modules: German, Chinese, English (54 inputs each, the gate's golden sets).

## What has to change first

- **Opus is not on OpenCode Go.** It is on OpenCode Zen, the pay-as-you-go service, at $4 / $20 per million tokens in and out. The adapter calls the Go endpoint only (`https://opencode.ai/zen/go/v1/chat/completions` in `src/server/opencode.mjs`). The judge needs a way to call Zen: an `endpoint` option on `OpenCodeProvider`, set by `JUDGE_ENDPOINT` in `scripts/judge.mjs` only. The product's generation stays on Go.
- **Zen bills the account's balance**, not the Go subscription. The owner tops it up and confirms the key may spend from it. The app never changes the console's *Use balance* toggle (C12).
- **Unverified:** that Zen's chat-completions endpoint takes `claude-opus-5-5` with the schema in the instructions, as Go does for Haiku. The trial checks it.

## Steps

1. **Adapter and trial.** Add the endpoint option, with a test in `tests/opencode.test.mjs`. Judge 6 recorded German cards with Opus. It checks valid verdicts, cost per card and time. Stop and report if more than one in six fails to parse.
2. **Calibrate Opus.** `npm run judge -- --calibrate` for German, Chinese and English (27, 29 and 35 cards). The gate counts the judge only when it agrees on 90 % and misses no expected fail. If Opus does not calibrate on a module, stop and report: either the calibration set or the rubric needs a look before any verdict counts.
3. **Generate.** Golden runs for both models on the three modules on the same day (`OPENCODE_MODEL=…`). They record cost, time, invalid replies and failing content checks, which need no judge.
4. **Judge.** `npm run gate -- <module>` with `JUDGE_MODEL=claude-opus-5-5` for each of the six runs.
5. **DeepSeek's verdicts on the same cards.** Judge the six runs again with DeepSeek, at its Go price. This shows how much of M6's gap was the judge, rather than the cards.
6. **The owner's blind read.** 10 inputs per module, both models' cards side by side, the model's name hidden, in a deck. The owner picks the better card or calls it even.

## What we report

Per module and model: invalid replies, cards failing a check, judge pass / weak / fail / error for Opus and for DeepSeek, mean cost and median time per card, the commonest failing criteria, and the owner's blind picks.

## Bar

Haiku is level when, on every module, its Opus fails are no more than DeepSeek's plus two, it has no more invalid replies or failing checks, and the owner's blind picks don't favour DeepSeek clearly (more than 6 in 10).

## Cost

- **Generation:** 324 cards, about $0.60 (M6 and M7 figures).
- **Opus judging:** about 90 calibration cards and 324 run cards. DeepSeek's judge spent about 3,700 µ$ a card at Go prices; at Opus's prices the same tokens would be about $0.10 a card. If Opus reasons less, it costs less. Estimate: **$30–50**, from the Zen balance. The trial in step 1 gives the real figure before the main run.
- **DeepSeek judging:** about $1.20.

## What it won't tell us

- **Opus and Haiku are from the same family**, so Opus may favour Haiku's style, the way DeepSeek may have favoured its own. Step 5 and the owner's blind read are there to show this.
- One sample per input; the judge's noise was about 4 inputs in 10 in M5. A gap of one or two fails means nothing.
- Expertise and Creativity modules are not run; both models were nearly clean on them already.
- Opus judging the product is for this experiment only. Whether to keep it as the gate's judge is a separate decision, made after we see the cost.

## Questions for the owner

1. Is $30–50 from the Zen balance acceptable, with a stop after the trial if the real figure is higher?
2. Should the blind read be 10 inputs per module, or fewer?
3. Should Luna run as a third arm under the same judge? It would add about a third to the judging cost.
