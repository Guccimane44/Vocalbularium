# Generation rounds: one request per module, a gate, or a split

27–28 October 2026 (Europe/Berlin). Evidence for [D17](../../architecture/decisions/d17-one-request.md). The question: can each content module write its whole card, including the decisions that steer it, in one text request, or does it need a first request that decides (a gate for Expertise relevance, a core round before the facets for Languages)?

## Method

Every input of the committed golden sets (`mathematics.json` 21, `computer-science.json` 18, `parents.json` 24 through German and Chinese), in English, one sample per variant, OpenCode Go, `deepseek-v4.1-flash`, four cards at a time. The runner, its prompts and every output are kept locally in `.data/rounds-2026-10-27/` (not committed).

| Family | Variant | Requests per card | What it is |
| --- | --- | --- | --- |
| all | **A** | 2 | Today (0.11.0): the run's word-or-sentence interpretation, then the module's word or sentence prompt |
| Expertise | **O** | 1 | One prompt: `relevance` (`subject`, `neighbouring`, `unrelated`) first, then the D16 rules of the three cases |
| Expertise | **G** | 2 | A gate request for `relevance`, then a prompt with only that case's rules |
| Languages | **O** | 1 | One merged prompt for a word or a sentence: `kind` first, `language`, `key`, `romanization`, `gramRole`, `meanings`; every facet states when it applies. German with eight facets (the four existing plus draft Conjugation, Declension, Comparison and Case) |
| German | **S** | 2 | The same core alone, then only the facets its `kind` and `gramRole` allow |

O and G use the same case wording, so only the number of requests differs. Expected cases and kinds come from each golden input's stated purpose.

## Results

**Expertise** (run 1):

| Module · variant | Failed | Case as expected | Text fits its case | `relevance` written first | Median time |
| --- | --- | --- | --- | --- | --- |
| Mathematics · A | 0 | — | — | — | 8.1 s |
| Mathematics · O | 0 | 21/21 | 21/21 | 21/21 | 5.7 s |
| Mathematics · G | 0 | 21/21 | 21/21 | — | 6.4 s |
| Computer Science · A | 0 | — | — | — | 8.5 s |
| Computer Science · O | 0 | 18/18 | 18/18 | 18/18 | 7.0 s |
| Computer Science · G | 0 | 18/18 | 18/18 | — | 8.5 s |

O and G never disagreed. Read side by side, the three variants give the same honest line for retinol and 幸福, the same one-paragraph answer for multi-core in Mathematics, and the same opening sentence for a Context outside the subject (ring as jewellery); O is sometimes a paragraph shorter on keys of the subject.

**Languages** took three runs:

1. **Run 1.** Structure was right (kind as expected 24/24 in both parents, no facet its flags ruled out), but *run* got one meaning against today's three to four, and the German idiom *Der Zug ist schon abgefahren* lost its figurative sense.
2. **Run 2.** The prompt was told to cover "every common meaning … not only the main one" and to give an idiom's figurative meaning. Idioms were fixed, but meanings ballooned (*laufen* 8, *schön* 5) and four cards hit the 60-second provider timeout.
3. **Ablation.** Five keys, two samples, one change at a time: the coverage phrase alone caused the growth (*run* 12 meanings, or a timeout); without it the merged prompt gives today's counts. Today's prompt itself gives *run* one meaning in some samples, so run 1's single meaning was mostly sampling variance. The four new grammar facets add about 7 seconds per card and do not change the meanings.
4. **Run 3** (coverage phrase removed, idiom line kept):

| Parent · variant | Failed | Kind as expected | Agrees with today's interpretation | Facets its flags rule out | Median time |
| --- | --- | --- | --- | --- | --- |
| German · A | 0 | — | — | — | 7.9 s |
| German · O | 0 | 24/24 | 24/24 | 0 | 10.1 s |
| German · S | 0 | 24/24 | 24/24 | 0, but 6 facets its flags required were missing | 20.3 s |
| Chinese · A | 0 | — | — | — | 7.0 s |
| Chinese · O | 0 | 24/24 | 24/24 | 1 (`gramRole` on a sentence) | 10.9 s |

Meanings over both parents: 77 for O against 67 for today, with differences in both directions on single keys. Spot checks of the new tables were correct (*laufen*: bin gelaufen, läufst, lief; *schön*: strong, weak and mixed declension, *schöner, am schönsten*); S once wrote *ihr liefet* for *ihr lieft*.

## Conclusion

- **No gate for Expertise.** One request that writes `relevance` first decided every case as the gate did, never contradicted its own case, and was faster.
- **One request for Languages, not a split.** The merged prompt matched today's word-or-sentence classification on every key, applied its facets by its own flags with one stray `gramRole`, and kept meanings at today's level once the coverage phrase was gone. The split was twice as slow and dropped facets.
- **What a single request costs** is output size: eight German facets add a few seconds. Instructions that widen the output, such as "every meaning", can push a card past the provider timeout and need a test before they ship.

## Limits

English only, one sample per variant, structural checks rather than the owner's judgement of quality; the new German facet prompts are drafts. The merged Languages prompt tested in run 3 is the one D17 proposes.
