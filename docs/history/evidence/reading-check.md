# 0.12.2 reading check: a card's Retry keeps its reading

29 October 2026 (Europe/Berlin). The verification [K61](../../architecture/traceability-map.md#clarifications) asks of [D19](../../architecture/traceability-map.md#entries) before 0.12.2 ships. The raw outputs are kept locally in `.data/golden/reading-2026-10-29T00-05-20-855Z.{json,md}` (not committed).

## Method

- **Inputs.** Six ambiguous keys without Context (`tests/golden/reading/ambiguous.json`): *Bank*, *Schloss*, *Leiter* and *行* through German and Chinese, *Kern* through Computer Science, *Ring* through Mathematics. Ten cards in all.
- **Runs.** Each card generated once, then retried five times with its saved core as `previous` and five times without, all facets on, `deepseek-v4.1-flash`, English interface, through `npm run smoke:reading` (110 calls).
- **Review.** Claude compared each retry's reading with the first card's: the word-or-sentence kind, the key's language, German's grammatical role or the Expertise relevance, and the senses the meanings or explanation describe. The owner reviews representative pairs at acceptance.

## Results

| Card | With `previous` | Without |
| --- | --- | --- |
| German: Bank | 5/5 keep both senses (bench, bank), in order | Senses reordered, one retry adds *Sandbank*, one keeps only the bench |
| Chinese: Bank | 5/5 keep 银行 / 河岸 / 库 | One retry drops 堤岸; all drop 库 |
| German: Schloss | 5/5 keep castle / lock | Senses kept; one adds a clasp on jewellery, one a museum |
| Chinese: Schloss | 5/5 keep 城堡；宫殿 / 锁 | One retry drops 锁 |
| German: Leiter | 5/5 keep leader / ladder, in order | Two retries drop the leader; order changes; one provider timeout |
| Chinese: Leiter | 5/5 keep 梯子 / 领导者 / 导体 | Order changes; one drops 导体 |
| German: 行 | 5/5 keep verb, xíng and háng, the same four senses (one writes the romanization with a slash) | Grammatical role changes in 2 of 5 (noun, adjective); senses added and dropped |
| Chinese: 行 | 5/5 keep the three xíng senses; each adds the romanization *xíng*, which the first card left out | Language named 中文 or 汉语; háng senses come and go |
| Computer Science: Kern | 5/5 kernel of an operating system | 5/5 kernel; one also names a processor core |
| Mathematics: Ring | 5/5 algebraic ring | 5/5 algebraic ring |

With `previous` no retry changed the reading. The text was written anew: the wording of the meanings and explanations varies between retries, except where a Chinese gloss is already minimal (银行, 锁, 梯子), where it repeats. Without `previous` the readings of the ambiguous Languages keys drift, which is the behaviour D19 removes.

## Limits

- One model and the English interface; five retries each way.
- Keys only, without Context: a Context that contradicts the saved reading was not tested.
- A first comparison script counted the romanization as part of the reading; the script now compares only the reading's flags, and the table above reads the outputs directly.
