# Step 1: Build the German golden set by facet

Draft, 2026-11-24. Part of the [v0.17.0 master plan](README.md). The current golden set is a loose collection of words taken from prompts and past bugs; this step builds a new one for German from the facets up, and ignores the old one except to keep its real defects.

## What the set is for

1. **Measure** each facet's fail and weak rate per model, closely enough to give each facet a model (steps 4–6).
2. **Supply** the calibration set's pass cards and real defects (step 2).
3. **Guard** against regressions when a prompt changes.

The first job sets the design. A word every model has memorised (gehen, sein, Haus) measures nothing, so the set is built from the ways each facet can fail, and its words are drawn from reference lists across frequency bands, not from memory.

## The design

### 1. Each facet lists how it can fail

Every facet, the core included, has its **failure points** declared in its module's golden plan (`golden/plan.ts`, beside `facets/`): the separate pieces of knowledge or decisions that can go wrong. Each failure point is a cell the golden set must fill. Coverage means every cell is filled, not that a word count is reached.

Each failure point has an ID, one line saying what goes wrong, and whether it is an **abstention** point (where the right answer is to leave the facet or a part of it out).

### 2. Words are drawn from reference lists, across frequency bands

Inside each failure point, words are taken from a reference list (Duden's list of strong and irregular verbs, Wiktionary's inflection categories, Kluge for etymology) and spread over three frequency bands by DWDS frequency class (0–6, from `dwds.de/api/frequency`):

- **common**: a floor every model should clear;
- **middle**: where models are expected to differ;
- **rare**: where a small model starts to guess.

The cut points live in the plan: common is class 4–6, middle 2–3, rare 0–1. Leipzig's classes were the first choice, but its public corpus is too small to rank rare words. Where a failure point has too few words for a band (indeclinable adjectives are mostly common), the cell records that, rather than padding with a forced word.

### 3. Two parts: what the model knows, and how it reads the key

German's grammar facets describe the German translation, not the key. A wrong conjugation on an English key can mean the model does not know the forms, or that it chose rennen where the item expected laufen. The two are measured apart.

- **The knowledge part** (about 95 items planned; 125 built, because three items per failure point and one per band for conjugation, declension and etymology need about 115): German keys, so the word each grammar facet describes is the key itself. Every facet's failure points are filled here.
- **The reading part** (about 25 items): foreign keys, the six kinds of input, the Context cases and the other source languages. It measures the core: the translation chosen, the sense, the kind, the flags. Its grammar facets are scored only where the card's word is one the set has a reference for (below).

### 4. Facets with one right answer carry reference answers

Article, declension, conjugation, comparison and case have answers a dictionary states. For these, the set stores **reference answers**, and a script scores them: free, exact, and needing no judge. The judge scores only the open facets: core, examples, synonyms, antonyms, etymology, simple translation, grammar teacher and pronunciation.

References are kept per German word, not per item, in a lexicon (`references.json`). An item names its word; a reading-part item names the words it may translate to (*run*: laufen or rennen), and the script scores whichever one the card chose, or leaves it to the judge when the card chose none of them.

A facet's reference is `"none"` or a list of **alternatives**, each one whole right answer in the facet's own cells, and each cell lists its accepted forms. The tables are expanded by Wiktionary's own templates (`npm run golden:draft`), so no inflection rules are written by hand:

```json
"Joghurt": {
  "pos": "noun",
  "source": { "page": "Joghurt", "revision": 10520939, "calls": ["{{Deutsch Substantiv Übersicht …}}"] },
  "checked": "DWDS wb Joghurt, …",
  "disputes": [{ "facet": "article", "cell": "singular", "wiktionary": "die Joghurt", "decided": "dropped: regional" }],
  "article": [ { "singular": ["der Joghurt"], "plural": ["die Joghurts"] },
               { "singular": ["das Joghurt"], "plural": ["die Joghurts"] } ]
}
```

- An alternative is a whole paradigm, so a card that mixes der and das Joghurt across rows fails, while either one throughout passes. A second form in one cell is a variant (des Tages, des Tags). A card cell that writes "der/das Joghurt" passes when every form in it is accepted. Regional or colloquial forms, and a second auxiliary that is not standard for the plain sense, are dropped and recorded in `disputes`.
- "None" is a reference too: Milch has no plural, tot has no comparison. A card that writes one fails.
- For Case, the reference is the set of cases the preposition governs (wegen: Genitiv, with Dativ accepted as colloquial). The use and the example stay with the judge.
- Every reference names its source and revision. Claude drafts it from Wiktionary and checks it against DWDS; the owner decides where the two disagree.

The script compares cell by cell, and a wrong cell fails only the failure points that own it: a wrong `Präteritum|ihr` fails `preterite-ihr` and nothing else on that card. It scores every closed facet a card's word has, not only those the item fills. A closed facet has no weak: a form is right or wrong. A card whose grammar word is wrong (Ufer for a bank) fails on the core, and its grammar tables are not scored against another word's reference.

### 5. Abstention items

Every abstention point gets items, because a small model's typical fault is to invent something: an etymology for a word Kluge calls unclear, a comparison for tot, an antonym for Tisch, a plural for Milch, a Grammar teacher for a foreign key.

### 6. Size by what we must measure

Telling a 10% fail rate from a 25% one needs about 100 cards per facet. Two samples of one item are closely related, so the set favours more items over more samples, and each item is chosen to stress several facets at once (a German noun covers article, declension, etymology and synonyms).

- At least 3 items per failure point, at least 1 of them in the test half.
- For etymology, conjugation and declension, one item per frequency band in every failure point that has words in that band; about 20 items each.
- About 150 items in all, the simulated slice included, run with 2 samples: about 300 cards a run.

### 7. Dev and test halves, split up front

Each failure point's items are split about 60/40 into **dev** and **test** before any run. Prompt work in step 6 looks only at dev cards. Test items change only by addition, and never because a model did badly on them. This is the golden set's counterpart to the calibration set's held-out part.

### 8. Pruning after the first benchmark

After step 5, items that every model passed in every sample are retired from dev, except a few kept as floor checks, and new items go into the failure points where models disagreed. The test half is never pruned. Retired items stay in the file, marked retired with the date, so past runs still resolve.

### 9. A slice of simulated captures

About 30 items drawn at random from public text, so the report can also say roughly what a reader of the web would see. The rest of the set is packed with hard cases on purpose, so its fail rates run far above what everyday captures meet.

- Sentences are drawn at random from the Leipzig Corpora Collection's news and Wikipedia corpora in German and English. Its API serves no Chinese and no web corpus, so Chinese is not in the slice.
- In each sentence, one word or short phrase is picked at random, weighted by how often it occurs, and the sentence becomes its Context, as a capture from a web page would have.
- The script that draws them (`scripts/golden-sample.mjs`) takes a fixed seed and records it, so the draw can be repeated. Picks that are not words (numbers, punctuation) are drawn again; nothing else is filtered by hand, because choosing by hand brings back the bias the draw avoids.
- The slice is split into dev and test like the rest.

The owner's own captures are not used: they reflect one reader, include development test words, and would make the set public with them. The tier decision comes from the knowledge part; this slice is a sanity check on it.

## German's failure points

The first draft, for the owner to correct. IDs are short and stable; an abstention point is marked ∅.

**Article** (reference)
- `gender-suffix`: gender a suffix predicts (-ung, -heit, -chen, -ling); a floor
- `gender-natural`: grammatical gender against natural sex (das Mädchen, das Weib)
- `gender-sense`: gender that depends on the sense (der/die See, der/die Kiefer, der/das Band)
- `gender-loan`: loanword gender (die E-Mail, das Handy, der or das Virus)
- `gender-compound`: a compound takes its last part's gender (die Haustür)
- `plural-class`: the plural class: -e with umlaut, -er, -s, -(e)n, unchanged
- `plural-foreign`: foreign plurals (Museen, Themen, Atlanten or Atlasse)
- `plural-sense`: the plural depends on the sense (Bänke, Banken; Wörter, Worte)
- `plural-none` ∅: no plural (Milch, Obst); plural only (Leute, Eltern)

**Declension** (reference)
- `genitive-s`: genitive -s against -es (des Hauses, des Lehrers)
- `dative-plural`: dative plural -n (den Kindern)
- `n-declension`: weak masculine nouns (des Jungen, dem Herrn, den Studenten)
- `mixed-noun`: mixed nouns (des Namens, des Herzens, dem Herzen)
- `missing-forms` ∅: "—" where a noun has no singular or plural
- `adjective-regular`: strong, weak and mixed endings; a floor
- `adjective-e-drop`: a dropped e (dunkle, teure, saure)
- `adjective-stem`: a stem change (hohe)
- `adjective-indeclinable` ∅: adjectives that do not decline (lila, rosa, prima)

**Conjugation** (reference)
- `present-vowel`: vowel change in du and er (nimmst, liest, läufst, fährst)
- `present-stem`: -est after a stem in -s, -ß or -z (du liest, du heißt)
- `et-insertion`: -et insertion (du arbeitest, ihr redet)
- `strong-preterite`: the strong Präteritum stem (sprang, half, lief)
- `preterite-ihr`: the ihr form in the Präteritum (lieft, gingt), Haiku's real fault
- `mixed`: mixed verbs (brachte, dachte, kannte, gebracht)
- `modal-wissen`: modals and wissen (kann, weiß, mochte)
- `separable`: separable verbs (stehe auf, stand auf, aufgestanden)
- `inseparable`: inseparable prefixes, no ge- (verstanden, bekommen)
- `prefix-sense`: separable or not by sense (übersetzen, umfahren)
- `auxiliary`: haben or sein in the Perfekt, including verbs that take both (ist gefahren, hat das Auto gefahren)
- `reflexive`: reflexive verbs (freue mich, habe mich gefreut)

**Comparison** (reference)
- `regular`: a floor (klein, kleiner, am kleinsten)
- `umlaut`: umlaut (alt, älter, am ältesten)
- `suppletive`: a different stem (gut, besser; viel, mehr)
- `stem-change`: hoch, höher; nah, näher, am nächsten
- `est-superlative`: -est after -s, -t, -z (am kürzesten, am heißesten)
- `e-drop`: dunkler, teurer
- `not-comparable` ∅: tot, schwanger, ganz

**Case** (reference)
- `accusative`: für, durch, ohne, gegen, um
- `dative`: mit, aus, bei, seit, von, zu, nach
- `two-way`: in, an, auf, über, with direction and place
- `genitive`: wegen, trotz, während, with the colloquial dative noted
- `genitive-rare`: anhand, aufgrund, innerhalb

**Etymology** (judge, with the source's account in the item)
- `inherited`: a native word with a known line (Wasser); a floor
- `latin-early`: an early Latin loan (Fenster, Mauer, Wein)
- `french`: a French loan (Büro, Restaurant)
- `english`: an English loan (Keks, Streik)
- `other-route`: a loan from or through another language (Tollpatsch, Kartoffel, Kaffee)
- `coined`: a coinage with a known author (Weltschmerz)
- `meaning-shift`: a word whose meaning changed (Gift, billig)
- `folk-etymology`: a word reshaped by folk etymology (Hängematte, Maulwurf), where a plausible wrong story tempts
- `disputed`: an origin dictionaries dispute (Kitsch); the card must not state one account as certain
- `unclear` ∅: Kluge calls the origin unclear; no Etymology is right

**Synonyms** (judge)
- `per-sense`: near synonyms for one sense of a word with several
- `register`: synonyms of a phrase or idiom in a matching register

**Antonyms** (judge)
- `true-opposite`: a true opposite, not a related word (Ufer is a real past fault)
- `by-sense`: antonyms that depend on the sense (alt: jung, neu)
- `none` ∅: no antonym (Tisch, Fernweh)

**Examples** (judge)
- `natural-use`: the key used naturally
- `translation`: the translation says the same as its sentence
- `sentence-key`: a sentence key gets one new sentence of the same structure
- `german-key` ∅: a German key's examples have no translation

**Simple translation** (judge)
- `abstract`: an abstract word in A2 German (Weltschmerz)
- `compound`: a long compound (Rechtsschutzversicherung)
- `sentence`: a sentence with hard words, in one simple line
- `order`: one line per meaning, in the core's order

**Grammar teacher** (judge)
- `foreign-key` ∅: absent for a key that is not German
- `sentence-points`: true points on a German sentence (Konjunktiv II, passive, verb-final clause)
- `word-points`: true points on a German word (separable, irregular forms)
- `little-to-say`: a key with little to teach (Tisch), where a padded point is weak

**Pronunciation** (judge)
- `speaks-translation`: speaks the German translation, with no label
- `loanword`: a loanword's German form (Restaurant, Orange)

**Core** (judge, reading part)
- `context-sense`: a Context that picks one sense (Schloss, bank)
- `context-flat`: a Context that does not narrow the sense (refrigerator)
- `original-meaning`: the original meaning kept beside the Context's
- `shared-spelling`: a spelling two languages share, decided by the Context (gift, Gift)
- `inflected-key`: an inflected form explained as its headword (lief, Häuser)
- `kind`: the six kinds: word, phrase, idiom, sentence, name, abbreviation
- `source-language`: keys in English, Chinese, French, Spanish, Japanese, Russian and Arabic
- `no-equivalent`: a word without a close German word (serendipity, тоска)

## Files

- `packages/domain/src/golden/define.ts` and `index.ts` (`@vocabularium/domain/golden`): the plan's types and `GOLDEN_PLANS`. The extension never imports it, so nothing ships to users.
- `packages/domain/src/catalog/languages/german/golden/plan.ts`: German's failure points per facet, which facets are scored against references, each point's cells, and the band cut points.
- `tests/golden/german/items.json`, `references.json` and `README.md`: the items, the reference answers, and how to add to both.
- `scripts/golden-sets.mjs`: the one reader of golden sets, single files and module folders alike. It checks a folder against its plan and the catalog: wrong data throws, missing data is a gap whose message names the fix. A module with a folder drops out of any family file, so `parents.json` keeps running English and Chinese with no edit.
- `scripts/golden-score.mjs` (`npm run golden:score -- german`), `golden-coverage.mjs` (`npm run golden:coverage -- german`), `golden-draft.mjs` (`npm run golden:draft -- german [words]`) and `golden-sample.mjs` (`npm run golden:sample`).

An item:

```json
{ "id": "bank-sitz", "key": "Bank", "context": "Wir saßen auf einer Bank im Park.", "why": "Plural by sense",
  "part": "knowledge", "split": "test", "word": "Bank#Sitz", "frequency": 4,
  "fills": { "article": ["plural-sense"], "declension": ["dative-plural"] },
  "expect": { "kind": "word", "gramRole": { "german": "noun" }, "contextual": true } }
```

A reading or sample item names `candidates` (the German words it may translate to) instead of `word`. The band comes from `frequency`.

## Enforcing it: a new facet grows the golden set

The rule: **a facet comes with its failure points, and the golden set fills every one of them, before the facet merges.** It is enforced in these places, highest first:

1. **The type.** A module's golden plan is a record over the module's own facets plus the core, each with a non-empty list of failure points. Adding a facet to German without adding its points is a compile error in `npm run check`. `GOLDEN_PLANS` lists the modules that have one; step 9 makes it required for every content module. A `golden` field on `FacetDefinition` was the first idea, but it would ship test data to users and stay optional until step 9.
2. **The catalog test** (`tests/catalog.test.mjs`), which runs in `npm test`, in the CI `verify` workflow, and in the gate's offline step. For every module with a golden plan, it fails when its folder (`tests/golden/<module>/`) has a gap:
   - a facet has no failure points;
   - a failure point has fewer than 3 items, or none in the test half;
   - an item fills a failure point or facet the catalog does not have;
   - a reference-scored facet's item has no reference for its word, or a reference does not match the facet's shape;
   - a reference is unchecked, or a dispute is undecided.

   Its message names the facet, the failure point and the fix ("add items to tests/golden/german/items.json"). From step 9 on, every content module must have a golden folder, which replaces today's "every content module has a golden set" test.
3. **The gate** (`scripts/gate.mjs`) runs the catalog test first, so `npm run gate -- german` refuses a module whose golden set does not cover its facets.
4. **The rules and docs.** A row in [code standards](../../code-standards.md), under Generation and prompts, names the rule and the catalog test. The [module catalog](../../subsystems/module-catalog.md#what-a-module-folder-holds) adds failure points to what a module folder holds, and the [quality gate](../../subsystems/quality-gate.md) page describes the golden folder, the references and the scoring.

A new failure point found later (a real defect that no point covers) is added to the facet the same way, and the test then asks for its items. That is how the set keeps growing.

## Tasks

1. Add the golden plan types and German's plan with the failure points above.
2. Draw the knowledge-part words from the reference lists by failure point and band; write the items and split them.
3. Draft the references from Wiktionary, check them against DWDS, and list every disagreement for the owner.
4. Write the reading-part items, and draw the simulated-capture slice with `scripts/golden-sample.mjs`.
5. Build the scorer and the coverage report; read every golden set through one reader; move German's silver picks to its folder.
6. Add the catalog test's checks, the code standards row, and the doc changes.
7. Run `npm run check` and `npm test`.
8. Run the set once on Haiku with 1 sample (`npm run smoke:generation -- german`), then score it. Fix any item whose expected flags or reference was wrong, not the prompt; each such fix says its source. This run is not judged; judging starts in step 3.
9. The owner reviews the failure points, the reference disagreements and the items, in the PR.

One PR, with no extension change, so no test build. Tasks 2 and 3 are the long ones.

## Check

- The catalog test passes, and fails when a failure point's items are removed (shown in the PR).
- The coverage report shows every failure point filled, by band where the band exists.
- The Haiku run generates every item, and the scorer gives per-facet results, each fail traced to a form and checked against the source.
- The owner has reviewed the failure points and every reference where the sources disagreed.

## Defaults taken

- Failure points live in the module's golden plan, typed against its facets, because a module owns its facets (D25) and the extension must not carry them.
- Closed facets have no weak verdict.
- References accept only forms DWDS lists as standard; laufen takes sein only. Duden is not fetched by scripts.
- 2 samples per item instead of 3; more items are worth more than more samples.
- Items run in the English interface language only. German writes its card in German whatever the interface language.
- Frequency bands from DWDS frequency classes.
- The simulated-capture slice draws from the Leipzig news and Wikipedia corpora (German and English), about 30 items, not from the owner's decks.

## Open questions for the owner

1. The failure points above: what is missing for a learner, and what is not worth measuring?
