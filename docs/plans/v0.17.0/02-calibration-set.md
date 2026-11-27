# Step 2: Rework the calibration set (German)

Draft, 2026-11-25. Part of the [v0.17.0 master plan](README.md). It starts from the German golden set built in [step 1](01-golden-set.md).

## What the set is for

The calibration set measures how far a judge's verdicts can be trusted. It holds cards whose right verdict a careful reviewer has already decided. The judge grades them without seeing those verdicts, and `npm run judge -- --calibrate german` compares the two. Opus is the judge either way (owner, 2026-11-24). The set does not decide whether it may judge. It shows, criterion by criterion and facet by facet, where its verdicts hold and where something else must check them ([step 3](03-judge.md)).

Today's German set has 27 cards and is too easy. Haiku passes it 27 out of 27, yet on real cards it misses guessed etymologies that Opus catches. Of its 13 fail cards, about 9 have an obvious planted fault. Only two touch etymology. No card expects weak. The judge prompt was tuned against these same cards.

This step builds a new set on which a judge blind to plausible faults shows up as blind. Step 3 then measures the Opus judge on it.

## What changes from today

1. **A verdict per criterion, not per card.** The judge already grades each rubric criterion separately: sense, german, facets, examples, etymology, simple-translation and grammar-teacher. Today a card stores one verdict for the whole card. So a judge that fails an etymology card for the wrong reason, say the synonyms, still counts as right. The new cards store a verdict for every criterion. A card's overall verdict is no longer stored. It is the worst of its criteria, as the judge works it out.
2. **A missed fail is counted per criterion, and per facet under the facets criterion.** A criterion labelled fail that the judge did not fail is a missed fail, even when the judge failed the card for another reason.
3. **Real faults first, with a minimum per criterion and per open facet.** Enough fails on each that the held-out part alone can show a judge is blind to one.
4. **Cards that expect weak**, so the line between pass and weak is tested.
5. **A held-out part tied to the golden set's split.** A card made from a golden test item is held out. A card made from a dev item is dev.
6. **Every verdict other than pass records its reason and its source.**

## The card format

```json
{ "id": "ufer-etymology-haiku", "item": "bank-ufer", "split": "held-out",
  "key": "bank", "context": "We sat on the bank and watched the river go by.", "language": "en",
  "generator": "claude-haiku-5-5", "fault": "real",
  "criteria": { "sense": "pass", "german": "pass", "facets": "pass", "examples": "pass",
                "etymology": "fail", "simple-translation": "pass", "grammar-teacher": "pass" },
  "reasons": { "etymology": [ { "why": "Says Ufer comes from Latin ora; it is inherited, Middle Low German ōver.",
                                "source": "DWDS, Pfeifer: Ufer" } ] },
  "decided": "claude",
  "card": { "core": {}, "facets": {} } }
```

- `item` names the golden item the card was made from, when there is one. `split` is then that item's split: `test` becomes `held-out`, `dev` stays `dev`. A card with no golden item, such as a recorded defect from an older run, states its own split.
- `generator` is the model that wrote the card.
- `fault` is `real`, `planted` or absent (for a card with nothing wrong).
- `criteria` grades every criterion of the module's rubric. A criterion that does not apply to the card (no Grammar teacher on an English key) is graded pass, because its absence is right.
- `reasons` holds a list of reasons, each with its source, for every criterion graded weak or fail. Under the facets criterion, each reason also names its `facet` (`synonyms`, `antonyms`, `pronunciation`, `article`, `declension`, `conjugation`, `comparison` or `case`), so step 3 can count agreement and missed fails per facet. A facets criterion with faults in two facets has one reason for each.
- `decided` says who settled the verdicts: `claude` for a draft the source supports, `owner` where the owner decided.
- **Messy cards** carry `verdict` (the card as a whole) and `reason` from the owner, instead of `criteria`, because there is no source to grade them criterion by criterion. On these cards a missed fail is a card the judge did not fail.

The facets criterion covers synonyms, antonyms, pronunciation and the grammar facets. Its `facet` field is what lets the report tell an antonym fault from a pronunciation fault.

```json
"reasons": { "facets": [ { "facet": "antonyms", "why": "Gives Wasser as the opposite of Ufer; it is related, not opposite.",
                           "source": "judgement call" } ] }
```

## How many cards, and which

| Kind | Dev | Held-out | Total |
| --- | --- | --- | --- |
| Pass (nothing wrong) | about 30 | about 15 | about 45 |
| Etymology fails | at least 6 | at least 4 | at least 10 |
| Fails on each other criterion (sense, german, examples, simple-translation, grammar-teacher) | at least 3 each | at least 2 each | at least 25 |
| Fails on each open facet under the facets criterion (synonyms, antonyms, pronunciation) | at least 3 each | at least 2 each | at least 15 |
| Expect weak | about 10 | about 5 | about 15 |
| Messy cards | 40 | 32 | 72 |

That is about 115 graded cards and 72 messy ones, close to a third held out. The minimums count criteria and facets, not cards, so one card may count toward two minimums when it has two real faults. The closed facets have no minimum here, because the step 1 scorer measures them; their few cards are a second check on the judge.

These numbers are small. With 2 to 4 held-out fails on a facet, one miss moves its agreement by 25 to 50 points. So step 3 reports counts ("missed 1 of 4"), not percentages alone.

**Etymology fails** cover these kinds, each at least once:

- a guessed history for a word with a known one (Ufer, Fernweh, wegen);
- a plausible wrong story where folk etymology tempts (Hängematte, Maulwurf);
- a disputed origin stated as certain (Kitsch);
- an etymology written for a word DWDS calls unclear, where the right card has none;
- the etymology of the wrong word (English window, not Fenster).

**Weak cards** come first from the criteria whose rubric defines weak: simple-translation (words above A2), grammar-teacher (a trivial point) and facets (a near-synonym). At least 2 each.

**Closed facets** need no cards of their own. Graded cards already carry article, declension and conjugation faults, and step 3 runs the step 1 scorer on the calibration cards to compare its verdicts with the judge's.

## Where the cards come from

**Generators.** Graded cards are written by Haiku 5.5 and Gemini 4 Argon on OpenCode Go. Opus 5.5 writes only messy cards, through the file route used for the 2026-11-24 benchmark. Opus is the judge measured in step 3, and a model tends to grade its own writing kindly, so none of the graded cards are its own. Step 3 reports agreement per generator, so any such lean shows.

**Pass cards** come from runs of the three generators on the new golden set. Every line of every criterion is checked against a source before the card is labelled pass.

**Real faults** come first. They start with what the Opus judge found on Haiku's cards on 2026-11-24: the Ufer, Fernweh and wegen etymologies, the run, 把 and get up Präteritum forms (these are closed-facet cards), and a garbled word. Then the new runs are read for more. Each fault is confirmed against a source before it is used.

**A fault found by a judge never measures that judge.** The 2026-11-24 faults were found by the Opus judge, so they go into dev: on the held-out part they would only show that Opus catches what it already caught. Held-out fails come from faults found without Opus: a dictionary check, the step 1 scorer, Argon, or reading the card line by line.

**Planted faults** are added only where real ones do not reach a criterion's minimum. A planted fault must be plausible: one changed fact a learner would not spot (a wrong century, a wrong language a loan passed through, the Präteritum of a similar verb). Blatant faults (antonyms written as synonyms) measure nothing a judge needs to prove.

**Fail cards are checked line by line too.** Every other criterion on a fail card gets its own verdict. A card with a second, unplanned fault says so instead of hiding it.

**The current 27 cards** are rechecked. Recorded cards that still hold go into dev. The prompt was tuned against them, so none can be held out. Blatant planted cards are dropped where a real fault now covers their criterion. The rest stay in dev as floor checks.

## Sources

- **DWDS first**, for meanings, grammar and examples. Its etymology entries come from Pfeifer's Etymologisches Wörterbuch, which is the etymology source.
- **Wiktionary** is a lead, never a source on its own.
- **Duden and Kluge** are used only when the owner looks them up, because scripts cannot reach them.
- **A disputed or unclear origin.** When Pfeifer calls an origin unclear or disputed, a card that states one account as certain fails etymology. A card that names the dispute passes. A card that writes no Etymology for an unclear word passes.
- **A left-out plural is weak** (owner, 2026-11-25). An article or declension that leaves out a plural DWDS gives (Kaffees, Tees, Wirtschaften) is graded weak under facets, not fail. A plural given for a noun that has none (Milch) stays a fail.
- **What no dictionary settles** (whether an English example sounds natural, whether a grammar point is worth a learner's notice) is a judgement call. Claude drafts it, marks it as one, and the owner decides.

## Messy captures

Step 1 added 36 messy captures to the golden set: slang, typos, broken selections, made-up words, colloquial forms, and noise such as a hashtag or an emoji, in seven languages. They have no right answer and no dictionary to check against. The golden set gives the model no instruction on them, so it decides what to make of each one. The owner is the judge here.

- **Cards.** Each messy item is generated once by Haiku and once by Opus, so the set holds a weaker and a stronger handling of the same capture: 72 cards. Half are Opus's own writing, above the third allowed for graded cards. That is fine for building the set, since the owner's verdicts do not depend on any judge. But step 3 reports agreement on messy cards separately for Haiku's and Opus's cards, so Opus grading its own cards kindly cannot hide in one number.
- **Verdicts.** The owner gives every card pass, weak or fail, with a one-line reason. Claude drafts no verdict on these cards, so the owner's judgement is not anchored to one.
- **Held out.** The 16 messy items in the golden test split give 32 held-out cards. The 20 dev items give 40 dev cards.
- **What the reasons become.** Claude gathers the reasons from the **dev cards only** into a short section on messy input in German's `rubric.md`, which the owner approves. Step 3 gives that section to the judge. The held-out reasons are kept in the cards but not read while writing the section. Otherwise the rubric would be fitted to the held-out cards.
- **Review in two sittings.** The 40 dev cards first, because the rubric section depends on them. The 32 held-out cards after.
- **The review file** (`npm run calibration:review -- german`) lays out each card with its capture, its Context and the card's core, with a place for the verdict and the reason. The same script reads the filled file back into the calibration file.

## Who decides what

Claude drafts the verdicts, with sources, on every graded card. The owner gets one review list with:

- every verdict where Claude's draft and the source disagree;
- every judgement call;
- every planted fault, to confirm it is plausible;
- 10 pass cards drawn at random, as a spot check of the line-by-line checking.

The owner's answers are recorded on the cards (`"decided": "owner"`).

## Tooling

- **The new card format in `scripts/judge.mjs`.** The calibration reads `criteria`, works out the card's verdict as the worst criterion, and counts a missed fail per criterion, and per facet from the `facet` field. `--part dev` runs the dev cards only. The full per-facet report, with held-out and pass/weak agreement, is built in step 3.
- **A structure test** in `tests/judge.test.mjs`. For every calibration file it checks that each graded card grades every criterion of the module's rubric, that every weak or fail has a reason and a source, that every reason under the facets criterion names a facet the module has, and that a card's split matches its golden item's split. For German it also checks the minimums above, and its message names the criterion or facet and the part that falls short. Every current card, in every module's file, moves to the new format graded as a whole: its verdict and reason are the old `expected` and `why`, its split is `dev`, and `decided` is `owner`, so the test holds for them too; other modules' minimums come in step 9.
- **The review script** `scripts/calibration-review.mjs`, for the messy cards.
- **Docs.** The calibration part of [quality gate](../../subsystems/quality-gate.md) describes verdicts per criterion, the held-out part and missed fails per criterion.

## Tasks

1. Change the card format, `judge.mjs` and the structure test. Convert the current files. Update the quality-gate page.
2. Generate the messy cards with Haiku and Opus. Write the review file. Owner sitting 1: the 40 dev cards.
3. Gather the real faults from the 2026-11-24 findings and confirm each against a source.
4. Run Haiku, Argon and Opus on the new golden set. Read the cards for more real faults, and choose the pass cards.
5. Check every pass and fail card line by line, criterion by criterion. Add weak cards, then planted faults where a minimum is still short.
6. Recheck the 27 current cards and place them.
7. Run `npm run check` and `npm test`.
8. Owner review: the review list, and sitting 2 on the 32 held-out messy cards. Write the messy-input section of `rubric.md` from the dev reasons, for the owner to approve.
9. Run the checks below on the dev part.

One PR, with no extension change, so no test build. Tasks 4 and 5 are the long ones.

## Check

- The structure test passes, and fails when an etymology fail is removed from the held-out part (shown in the PR).
- The owner has gone through the review list and given a verdict on every messy card.
- **The set is hard enough.** Haiku as judge, on the dev part, falls below the 90% agreement target or misses at least one fail, and among its misses is at least one etymology fail. Haiku is known to miss these, so if it misses none, the set is still too easy. This is a sign about the set, not a gate on any judge.
- **The set is not wrongly strict.** Opus as judge, on the dev part, through the file route: every pass criterion it fails is rechecked against its source. A label changes only when the source shows it was wrong, never to match the judge.
- No judge has been run on the held-out part. The first held-out run is step 3's.

## Defaults taken

- Verdicts per criterion replace verdicts per card, in every module's calibration file, so one format holds.
- The held-out part follows the golden set's split instead of a separate draw.
- No graded card is written by Opus; Haiku and Argon give enough faults and passes. Opus writes only messy cards.
- DWDS with Pfeifer is the main source. Duden and Kluge only through the owner, who has no access to them.
- The messy-input section of the rubric is written from dev cards only.
- Haiku and Opus write the messy cards. Argon is left out there to keep the owner's review at 72 cards.
- Weak has no bar. Step 3 reports pass/weak agreement per criterion and facet, as a number.
- Minimums are set for the open facets under the facets criterion (synonyms, antonyms, pronunciation), not for the closed ones, which the step 1 scorer measures.

## Owner answers

- **The review list** (2026-11-26). The owner went through it and agreed with the drafts, including the seven general rulings. The 44 cards it asked about (the judgement calls, the old cards that changed, and the planted faults) are marked `"decided": "owner"`.
- **The messy cards** (2026-11-26). The owner skimmed both review files, found the cards good, and handed the grading to Claude. Claude graded the 32 held-out cards first, before any rubric text existed, then the 40 dev cards, then wrote the messy-capture section of German's `rubric.md` from the dev reasons only, which the owner approved the same day. All 72 are `"decided": "claude"` (`npm run calibration:review -- read german <part> --by claude`). Result: 54 pass, 13 weak, 5 fail; all 5 fails and 8 of the weak cards are Haiku's. Since Claude is Opus, the messy cards no longer measure an Opus judge independently: step 3 reports Opus's agreement on them as a sign, not a measure.
- **Duden and Kluge** (2026-11-26). The owner has no access. The six points that only they could settle (the origins of Junge, Kaffee, Plan and Cricket, the Chaiselongue plural, the Wicket plural) keep the verdict DWDS and Pfeifer support, and stay `"decided": "claude"` where the review list did not ask about them.
