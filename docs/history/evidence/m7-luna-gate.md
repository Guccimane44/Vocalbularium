# M7: GPT-6 Luna through the gate

Run 14 November 2026 from `main` after 0.16.4 with PRs 306 and 307 merged (one English module, no dictionary), as step 2 of the Luna and dictionary plan (`docs/plans/luna-and-dictionary-expansion.md` on `claude/german-tables`) and its M7 draft. The product's own gate (`npm run gate -- <module>`) for every content module with `OPENCODE_MODEL=gpt-6-luna`, and for German, Chinese and English with `deepseek-v4.1-flash` on the same day as the baseline. The judge is DeepSeek in every run (`JUDGE_MODEL=deepseek-v4.1-flash`, [PR 308](https://github.com/Guccimane44/Vocalbularium/pull/308)). Nothing mocked. One sample per input; Luna at its default reasoning. Gate reports, golden runs and judgements are in `.data/gates/`, `.data/golden/` and `.data/judge/` (not committed).

The plan asked for a DeepSeek baseline for German only. Chinese and English were added because Luna failed many more of their cards than German's; without a same-day DeepSeek run the bar couldn't be read for them. Expertise and Creativity had no failed card on Luna, so they need none.

## Summary

- **German: level.** 8 failed or unscored cards on each model; Luna had fewer invalid replies (3 against 5) and more weak cards (17 against 11).
- **Chinese: Luna is worse.** 11 failed cards and 1 unscored against DeepSeek's 3; 3 failing content checks against 1. Luna's fails are factual slips spread over facets: Etymology (3), Simple translation (3, two repeating the core), Pinyin (2), Examples (2).
- **English: Luna is worse.** 9 failed and 2 unscored against DeepSeek's 4. Four of Luna's fails are one fault: for an English key, Pronunciation speaks the meanings or a paraphrase instead of the key (*bank* → *riverbank, financial institution*), which the `english-key-spoken` check catches. Two more are wrong etymologies.
- **Expertise and Creativity: nearly clean.** No failed card in Computer Science, Mathematics, Chemistry or Joke, and one in Modern Haiku (*autumn*, two lines that rhyme); Traditional Haiku had 4 invalid replies, all `"reading": []` for a non-Japanese haiku, and none after [PR 310](https://github.com/Guccimane44/Vocalbularium/pull/310) reads an empty optional list as left out. Pronunciation has no rubric, so only its golden set and checks ran: no error, no failing check.
- **Cost and time:** Luna is 5 to 6 times cheaper and 4 to 6 times faster than DeepSeek on the three language modules: 288–392 µ$ and 5–9 s a card against 1,423–2,222 µ$ and 22–36 s.
- **Against the bar** (per module, no more failed cards, failing checks or invalid replies than same-day DeepSeek, within the judge's noise): **German passes; Chinese and English do not.** The gaps (11 against 3, 9 against 4) are larger than the judge's noise, and the reasons are specific, checkable errors rather than taste.

| Module | Model | Cards | Invalid replies | Failing checks | Judge: pass / weak / fail / unscored | Mean cost | Median time |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| German | DeepSeek | 54 | 5 | 0 | 34 / 11 / 8 / 1 | 2,222 µ$ | 36.1 s |
| German | Luna | 54 | 3 | 1 | 29 / 17 / 8 / 0 | 392 µ$ | 8.7 s |
| Chinese | DeepSeek | 54 | 1 | 1 | 44 / 7 / 3 / 0 | 1,423 µ$ | 22.2 s |
| Chinese | Luna | 54 | 0 | 3 | 39 / 3 / 11 / 1 | 288 µ$ | 5.0 s |
| English | DeepSeek | 54 | 1 | 3 | 45 / 5 / 4 / 0 | 1,901 µ$ | 30.8 s |
| English | Luna | 54 | 1 | 5 | 38 / 5 / 9 / 2 | 299 µ$ | 5.6 s |
| Computer Science | Luna | 18 | 0 | 0 | 15 / 3 / 0 / 0 | 117 µ$ | 2.7 s |
| Mathematics | Luna | 21 | 0 | 0 | 16 / 5 / 0 / 0 | 168 µ$ | 3.2 s |
| Chemistry | Luna | 22 | 0 | 0 | 20 / 2 / 0 / 0 | 128 µ$ | 2.4 s |
| Pronunciation | Luna | 16 | 0 | 0 | no rubric | 73 µ$ | 1.5 s |
| Traditional Haiku | Luna | 12 | 4 | 0 | 7 / 1 / 4 / 0 | 399 µ$ | 5.4 s |
| Traditional Haiku, with PR 310 | Luna | 12 | 0 | 0 | 10 / 2 / 0 / 0 | 338 µ$ | 6.9 s |
| Modern Haiku | Luna | 12 | 0 | 0 | 8 / 3 / 1 / 0 | 204 µ$ | 3.9 s |
| Joke | Luna | 12 | 0 | 0 | 9 / 3 / 0 / 0 | 210 µ$ | 4.4 s |

A card's invalid reply also counts as a failed card in the judge's columns. "Unscored" is a judge call that timed out or lost its connection. Every gate's verdict is *failed*: no module, on either model, meets the gate's own bar of no failed card and at most 10 % weak, as M6 found for DeepSeek.

## The judge

The DeepSeek judge was calibrated the same day for the five modules it had no calibration for: English 94 % (33 of 35), Chemistry, Traditional Haiku, Modern Haiku and Joke 100 %, no recorded fail missed. German, Chinese, Computer Science and Mathematics use their calibration of 3 November (100 %, 100 %, 100 %, 92 %). Pronunciation has no rubric.

## Spend

About $1.80 in all: $1.39 for the runs above (judge $1.02, generation $0.38), about $0.15 for the five calibrations, and about $0.30 for the Traditional Haiku rerun and two English gates with the Forms facet (D35, reported with it).

## Limits

- One sample per input, one day. The judge disagreed with itself on about 4 inputs in 10 in M5; a difference of one or two fails means nothing, a difference of eight probably does.
- The judge was calibrated on DeepSeek's cards; whether it judges Luna's style fairly is unknown. The owner's reading of the deck is the second measure.
- Luna's default reasoning only; M6 found `high` no better on German.
- No prompt was tuned for Luna. The English Pronunciation fault looks like one a prompt or check can fix; that is a separate change.

## Per module

Failed and weak cards with the judge's reasons, failing content checks and errors, as the gate reported them.

#### german · deepseek-v4.1-flash

Gate **failed** (judge deepseek-v4.1-flash). 54 cards; 5 failed to generate; 0 failing a content check; 0 with unexpected flags. Mean cost 2,222 µ$, median time 36.1 s (words 2,653 µ$, 44.5 s; sentences 734 µ$, 7.8 s). Judge: 34 pass, 11 weak, 8 fail, 1 not scored.

- **Error**, 行: A module returned content in an unexpected format: The core has an unexpected field "contextualFirst".
- **Error**, sein: Generation returned an incomplete result.
- **Error**, gehen: Generation returned an incomplete result.
- **Error**, gut: Generation returned an incomplete result.
- **Error**, 把: Generation returned an incomplete result.
- **Fail**, 行: error: A module returned content in an unexpected format: The core has an unexpected field "contextualFirst".
- **Fail**, laufen: german fail: The Präteritum form 'ihr liefet' is wrong; correct is 'ihr lieft'. · facets fail: The conjugation lists 'ihr liefet' under Präteritum, but the correct Präteritum is 'ihr lieft'.
- **Fail**, sein: error: Generation returned an incomplete result.
- **Fail**, gehen: error: Generation returned an incomplete result.
- **Fail**, gut: error: Generation returned an incomplete result.
- **Fail**, wegen: german weak: «Aus mittelhochdeutsch wegen» is unidiomatic; standard German would be «aus dem Mittelhochdeutschen». · etymology fail: The quoted «des Weges» does not mean 'um … willen'; the phrase is «des Weges wegen».
- **Fail**, 把: error: Generation returned an incomplete result.
- **Fail**, 咖啡: etymology fail: The text says 'von dort als koffie ins Niederländische', but Kaffee came via Italian caffè, not directly from Turkish to Dutch.
- **Weak**, run: simple-translation weak: Line 2 'eine Firma oder einen Betrieb leiten' leaves out 'Organisation'.
- **Weak**, 打算: german weak: The phrases 'über französisch plan' and 'auf lateinisch planus' are not idiomatic German; they need inflected forms/articles.
- **Weak**, Fernweh: etymology weak: Origins lists 'Althochdeutsch' although Fernweh is a German new formation; only 'Weh' goes back to OHG.
- **Weak**, dépaysement: simple-translation weak: The second line omits the core's 'der dieses Gefühl hervorruft'.
- **Weak**, COVID-19: simple-translation weak: 'eine Krankheit, die von einem Virus kommt und die Atemwege und die Lunge krank macht' omits 'Infektionskrankheit' and 'Coronavirus SARS-CoV-2'.
- **Weak**, We sat on the bank and watched the river.: german weak: 'am Rand von dem Fluss' is unidiomatic; 'am Ufer des Flusses' would be natural German.
- **Weak**, tot: grammar-teacher weak: The example 'toter' is also a standard inflected form, so the wording about nonstandard forms is misleading.
- **Weak**, 经济: german weak: The phrase 'alles, wo' is colloquial rather than standard German. · simple-translation weak: 'Wissenschaft' and 'System' are above A2 where simpler wording is possible.
- **Weak**, tea: german weak: The etymology wording 'aus niederländisch thee' is not natural German; it should be e.g. 'aus dem niederländischen thee'.
- **Weak**, 我把书放在桌子上了。: simple-translation weak: The line adds 'genommen', which is not in the Chinese sentence.
- **Weak**, Fenster: simple-translation weak: “ein Glas in der Wand” describes the glass rather than the opening and leaves out the roof and air.
- **Not scored**, 一举两得: error: fetch failed

#### german · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash). 54 cards; 3 failed to generate; 1 failing a content check; 0 with unexpected flags. Mean cost 392 µ$, median time 8.7 s (words 456 µ$, 10.0 s; sentences 160 µ$, 3.9 s). Judge: 29 pass, 17 weak, 8 fail.

- **Error**, 行: Generation returned an invalid result.
- **Error**, sein: Generation returned an invalid result.
- **Error**, tot: Generation returned an invalid result.
- **Check**, Schloss: core.context-meaning: "Vorrichtung zum Verschließen einer Tür" is repeated among the meanings; simple-translation.line-per-meaning: 2 lines for 3 meanings
- **Fail**, Schloss: check core.context-meaning: "Vorrichtung zum Verschließen einer Tür" is repeated among the meanings · check simple-translation.line-per-meaning: 2 lines for 3 meanings · sense weak: The contextual sense 'Vorrichtung zum Verschließen einer Tür' is repeated in 'meanings'. · simple-translation weak: 'Herrscher' and 'Adliger' are above A2 and are not explained in simpler German.
- **Fail**, 行: error: Generation returned an invalid result.
- **Fail**, serendipity: etymology fail: The origin 'Althochdeutsch' is wrong for 'Zufall', which is Middle High German (mhd. zuoval).
- **Fail**, sein: error: Generation returned an invalid result.
- **Fail**, Junge: german fail: The article 'der Junge' is given for the sense 'junges Tier', which is neuter 'das Junge', so the gender is misleading. · facets fail: The article and declension give only masculine 'der Junge'/'den Jungen', not neuter 'das Junge' for the listed animal sense. · grammar-teacher fail: The note 'Junge ist ein maskulines Nomen' is false for the listed animal sense 'das Junge', whose accusative singular is 'das Junge', not 'den Jungen'.
- **Fail**, tot: error: Generation returned an invalid result.
- **Fail**, 把: facets fail: The pronunciation list includes 'ein Messer' and 'das Objekt vor das Verb stellen', which are not German translations of 把.
- **Fail**, 咖啡: german fail: 'das deutsche Kaffee' has the wrong gender; it should be 'der deutsche Kaffee' or 'das deutsche Wort Kaffee'.
- **Weak**, run: sense weak: "sich zu Fuß fortbewegen" is too broad for "run", which means moving quickly on foot. · simple-translation weak: "mehrere Aufführungen nacheinander" omits "Veröffentlichungen", and "sich zu Fuß fortbewegen" is above A2.
- **Weak**, break the ice: german weak: The phrase 'unbeholfene Situation' is not idiomatic German; 'unangenehme Situation' would be natural.
- **Weak**, beautiful: simple-translation weak: Only 'angenehm anzusehen' is given, leaving out the core meaning 'schön'.
- **Weak**, laufen: simple-translation weak: 'in Betrieb sein' is repeated unchanged instead of being explained in simpler A2 German
- **Weak**, Fernweh: facets weak: The article facet gives only 'das Fernweh' without the plural, and 'meist nur im Singular' is imprecise for a noun with no plural. · simple-translation weak: 'Sehnsucht' is repeated without a simpler explanation for an A2 learner. · grammar-teacher weak: 'meist nur im Singular' is imprecise because 'Fernweh' has no plural.
- **Weak**, COVID-19: simple-translation weak: SARS-CoV-2 is left unexplained rather than rephrased in simple A2 German.
- **Weak**, 我真的很幸福: simple-translation weak: "Ich bin sehr glücklich" leaves out "wirklich"
- **Weak**, Ich habe Fernweh.: simple-translation weak: The line softens 'sehne mich danach' to 'möchte' and replaces 'fremde Orte kennenzulernen' with 'neue Orte sehen', leaving out part of the meaning.
- **Weak**, aufstehen: examples weak: The German sentences carry German paraphrases such as „Bitte erheben Sie sich.“ as if they were translations, though a German key needs no translation.
- **Weak**, sich freuen: examples weak: The German examples add redundant translation lines such as “Sie ist froh über das Geschenk.” although a German key needs none.
- **Weak**, gut: facets weak: The synonyms 'ausgezeichnet' and 'vortrefflich' are stronger near-synonyms, not exact equivalents of 'gut'. · simple-translation weak: The second line 'richtig und freundlich zu anderen' drops the moral sense of 'moralisch richtig'.
- **Weak**, in: examples weak: The German examples include German 'translations' such as 'im Garten' and 'ins Haus', which should be absent for a German key.
- **Weak**, wegen: simple-translation weak: 'aus einem Grund' is vague and leaves out the 'aus Anlass von' sense.
- **Weak**, tea: german weak: The phrase 'auf chinesisch te' is not correct natural German; it should be 'auf das chinesische Wort te' or 'auf Chinesisch te'.
- **Weak**, Fenster: simple-translation weak: The line drops "meist" from "meist mit Glas", changing "usually with glass" to "with glass".
- **Weak**, Wenn ich Zeit hätte, würde ich mitkommen.: simple-translation weak: The two-line translation uses 'käme' where the simpler A2 form 'würde mitkommen' would fit.
- **Weak**, Wohnung: etymology weak: The text gives no earlier forms such as ahd. wonunga or mhd. wonunge. · simple-translation weak: 'abgeschlossener Bereich' is not explained in simpler A2 German.

#### chinese · deepseek-v4.1-flash

Gate **failed** (judge deepseek-v4.1-flash). 54 cards; 1 failed to generate; 1 failing a content check; 1 with unexpected flags. Mean cost 1,423 µ$, median time 22.2 s (words 1,631 µ$, 29.6 s; sentences 629 µ$, 9.2 s). Judge: 44 pass, 7 weak, 3 fail.

- **Error**, gut: Generation returned an incomplete result.
- **Check**, 咖啡: core.context-meaning: "用咖啡豆磨成粉煮出的饮料，味道苦，喝了能提神" is repeated among the meanings; simple-translation.one-line-per-meaning: 1 lines for 2 meanings
- **Flags**, 咖啡: contextual: true, expected false
- **Fail**, 我真的很幸福: grammar-teacher fail: The last note discusses a “是” construction absent from the selection and wrongly says the adjective phrase must take “很,” though “我是幸福的” is fine.
- **Fail**, gut: error: Generation returned an incomplete result.
- **Fail**, 咖啡: check core.context-meaning: "用咖啡豆磨成粉煮出的饮料，味道苦，喝了能提神" is repeated among the meanings · check simple-translation.one-line-per-meaning: 1 lines for 2 meanings · sense weak: No Context is given, yet 'contextual' repeats the same meaning as 'meanings'.
- **Weak**, bank: chinese weak: The etymology writes 銀行 in traditional characters instead of simplified 银行.
- **Weak**, 行: etymology weak: “这个读法后来写作 háng” should be “读作 háng”; háng is pinyin, not a written form.
- **Weak**, serendipity: chinese weak: The phrase 善于偶然发现珍奇事物 is unidiomatic; 善于 cannot naturally govern 偶然发现.
- **Weak**, We sat on the bank and watched the river.: examples weak: “来往的” adds boats coming and going, which is not in “watched the boats”. · simple-translation weak: “河边的岸上” is redundant and less natural than “河岸”.
- **Weak**, wegen: simple-translation weak: 说明事情发生的原因 is a function description rather than a simple rendering of 因为；由于.
- **Weak**, Wenn ich Zeit hätte, würde ich mitkommen.: sense weak: The Chinese '如果我有时间，我就一起去' drops the unreal 'hätte/würde' sense of the German. · examples weak: The translation '如果我们有时间，我们就去看电影' drops the unreal 'hätten/würden' of the German example.
- **Weak**, apartment: etymology weak: The origins list says 「现代汉语」 but the text dates the compound to 「近代」, so the period is inconsistent.

#### chinese · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash). 54 cards; 0 failed to generate; 3 failing a content check; 0 with unexpected flags. Mean cost 288 µ$, median time 5.0 s (words 319 µ$, 5.4 s; sentences 169 µ$, 3.2 s). Judge: 39 pass, 3 weak, 11 fail, 1 not scored.

- **Check**, 打算: simple-translation.simpler-than-core: "心里想做的事" repeats the core
- **Check**, get up: pinyin.tone-marked-pinyin: "qǐchuáng" has 2 syllables for the 7 characters of "起床；从床上起来"
- **Check**, Have you got a pen?: simple-translation.simpler-than-core: "你有笔吗？" repeats the core
- **Fail**, bank: etymology fail: The history explains 河岸, the contextual sense, not 银行, the first meaning.
- **Fail**, run: simple-translation fail: “用双腿快速向前走” describes walking quickly, not running.
- **Fail**, serendipity: chinese fail: “有价值事物” and “有益事物” should be “有价值的事物” and “有益的事物”. · examples weak: “纯属巧合” loses the lucky sense of “serendipity” and “珍贵的书” renders “rare book” imprecisely.
- **Fail**, 打算: check simple-translation.simpler-than-core: "心里想做的事" repeats the core · simple-translation fail: The second line '心里想做的事' repeats the core unchanged and is not simpler.
- **Fail**, gut: sense fail: “勇气” is the sense of “guts” (plural), not singular “gut,” so the card gives a wrong sense. · chinese weak: “取出内部” is not a natural Chinese gloss; a native would say “取出内脏” or “掏空”. · examples fail: “It takes gut to speak up” is ungrammatical; English requires “guts”.
- **Fail**, tot: examples fail: “She toted up” should be “totted up”; “toted” does not use the selection and the translation says add up.
- **Fail**, in: pinyin fail: 穿着 is used here for “wearing” but is transcribed chuānzhuó instead of chuānzhe.
- **Fail**, Fenster: etymology fail: The claim that “户” later also means “窗” is false.
- **Fail**, apartment: etymology fail: '古汉语' wrongly dates the modern compound 公寓.
- **Fail**, get up: check pinyin.tone-marked-pinyin: "qǐchuáng" has 2 syllables for the 7 characters of "起床；从床上起来" · chinese weak: “从坐着或躺着变成站立” and “从坐着或躺着变成站着” are unidiomatic; a native would say “从坐着或躺着站起来”. · pinyin weak: “qǐchuáng” and “zhàn qǐlái” cover only the headwords, not the rest of the Chinese lines.
- **Fail**, Have you got a pen?: check simple-translation.simpler-than-core: "你有笔吗？" repeats the core · simple-translation fail: The simple translation '你有笔吗？' is identical to the core meaning, so it is no simpler than the core.
- **Weak**, bank: chinese weak: '办钱' in the simple translation is not natural Chinese. · simple-translation weak: '办钱' is not an everyday word for banking services.
- **Weak**, sein: simple-translation weak: Line 2 '表示某个人或东西属于他' omits 它的 ('its').
- **Weak**, colour: etymology weak: “颜” originally meant the forehead/between the eyebrows, not the whole face.
- **Not scored**, Wenn ich Zeit hätte, würde ich mitkommen.: error: fetch failed

#### english · deepseek-v4.1-flash

Gate **failed** (judge deepseek-v4.1-flash). 54 cards; 1 failed to generate; 3 failing a content check; 0 with unexpected flags. Mean cost 1,901 µ$, median time 30.8 s (words 2,179 µ$, 35.0 s; sentences 839 µ$, 12.8 s). Judge: 45 pass, 5 weak, 4 fail.

- **Error**, 把: Generation returned an incomplete result.
- **Check**, run: examples.english-key-untranslated: an example of an English key has a translation
- **Check**, window: examples.english-key-untranslated: an example of an English key has a translation
- **Check**, apartment: examples.english-key-untranslated: an example of an English key has a translation
- **Fail**, run: check examples.english-key-untranslated: an example of an English key has a translation
- **Fail**, 把: error: Generation returned an incomplete result.
- **Fail**, window: check examples.english-key-untranslated: an example of an English key has a translation · english weak: The grammar note 'Use in or through with it' is awkward without quotation marks around 'in' and 'through'. · examples weak: The English examples are natural, but they carry duplicate English 'translations', though an English selection should have none.
- **Fail**, apartment: check examples.english-key-untranslated: an example of an English key has a translation · examples weak: The translation fields repeat the English sentences; English examples should have no translation.
- **Weak**, Schloss: english weak: Simple-translation says "close with a key" where natural English would say "lock with a key". · facets weak: The simple translation's "close with a key" is off for a lock, and the etymology lists "Old English" before "Proto-Germanic".
- **Weak**, serendipity: facets weak: The synonyms 'chance', 'luck', 'fluke', 'fortuity' and 'happenstance' are broad near-synonyms, not exact equivalents of 'serendipity'.
- **Weak**, 我真的很幸福: facets weak: The simple translation 'I feel very happy' omits 'really' from 'I am really very happy'.
- **Weak**, aufstehen: facets weak: The simple translation 'to fight against a government' narrows 'to rise up against something'.
- **Weak**, gut: facets weak: The simple translation for sense 5 says only "the inside of a building" and omits "or vehicle".

#### english · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash). 54 cards; 1 failed to generate; 5 failing a content check; 0 with unexpected flags. Mean cost 299 µ$, median time 5.6 s (words 343 µ$, 6.5 s; sentences 130 µ$, 2.9 s). Judge: 38 pass, 5 weak, 9 fail, 2 not scored.

- **Error**, get up: Generation returned an invalid result.
- **Check**, bank: pronunciation.english-key-spoken: an English key speaks itself, not ["riverbank","financial institution","reserve"]
- **Check**, bank: examples.english-key-untranslated: an example of an English key has a translation
- **Check**, tot: pronunciation.english-key-spoken: an English key speaks itself, not ["child","small drink","add up"]
- **Check**, colour: pronunciation.english-key-spoken: an English key speaks itself, not ["color","pigment","add color"]
- **Check**, Have you got a pen?: pronunciation.english-key-spoken: an English key speaks itself, not ["Are you carrying or do you have a pen?"]
- **Fail**, bank: check pronunciation.english-key-spoken: an English key speaks itself, not ["riverbank","financial institution","reserve"] · facets fail: Pronunciation gives “riverbank,” “financial institution,” and “reserve” instead of the spoken key “bank.”
- **Fail**, bank: check examples.english-key-untranslated: an example of an English key has a translation · facets weak: Pronunciation lists 'riverbank', which is not a pronunciation of 'bank'. · examples weak: The English examples include translations ('She put her paycheck...', 'We sat on...') though an English selection's examples should have none.
- **Fail**, serendipity: facets fail: The etymology wrongly calls Sarandīb Persian; it is Arabic, from Sanskrit Siṃhaladvīpa.
- **Fail**, tot: check pronunciation.english-key-spoken: an English key speaks itself, not ["child","small drink","add up"] · facets fail: Pronunciation lists “child”, “small drink”, and “add up” instead of the spoken word “tot”.
- **Fail**, 经济: facets fail: simple-translation gives “using little money or resources” for the listed “economic” sense, which actually means relating to the economy.
- **Fail**, tea: facets fail: Etymology omits Malay 'teh' and wrongly says the word first meant the leaves rather than the drink.
- **Fail**, colour: check pronunciation.english-key-spoken: an English key speaks itself, not ["color","pigment","add color"] · english weak: The simple translation 'to give something a shade' is not idiomatic English. · facets fail: The pronunciation facet gives 'pigment' and 'add color', which are not pronunciations of 'colour'.
- **Fail**, get up: error: Generation returned an invalid result.
- **Fail**, Have you got a pen?: check pronunciation.english-key-spoken: an English key speaks itself, not ["Are you carrying or do you have a pen?"] · english weak: “Are you carrying or do you have a pen?” is slightly unnatural without an object after “carrying”. · facets fail: The pronunciation facet gives “Are you carrying or do you have a pen?” instead of the selection itself.
- **Weak**, Schloss: facets weak: The simple-translation keeps 'impressive' and 'fortress', which are above CEFR A2.
- **Weak**, 打算: facets weak: The origins array ['French','Latin'] is not oldest first as required.
- **Weak**, El que madruga, Dios le ayuda.: facets weak: The simple translation 'People who get up early are more likely to succeed' paraphrases rather than saying the same as 'God helps those who get up early.'
- **Weak**, color: facets weak: 'the color red' is a countable use, not an uncountable one.
- **Weak**, Wohnung: examples weak: The translation "The home is small but cozy" renders Wohnung as "home" rather than "apartment" or "flat".
- **Not scored**, sein: error: fetch failed
- **Not scored**, 把: error: The operation was aborted due to timeout

#### computer-science · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash). 18 cards; 0 failed to generate; 0 failing a content check; 0 with unexpected flags. Mean cost 117 µ$, median time 2.7 s. Judge: 15 pass, 3 weak, 0 fail.

- **Weak**, 递归: facet weak: The Python example has no comments, though the code facet asks for a commented example.
- **Weak**, 幸福: learner weak: The explanation never says that 幸福 means 'happiness'
- **Weak**, retinol: learner weak: "not a computer science concept" tells the learner nothing about what retinol actually is

#### mathematics · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash). 21 cards; 0 failed to generate; 0 failing a content check; 0 with unexpected flags. Mean cost 168 µ$, median time 3.2 s. Judge: 16 pass, 5 weak, 0 fail.

- **Weak**, prime number: accuracy weak: 'no other whole number divides it exactly' omits the comparison to 1 and 7.
- **Weak**, Frontend: case weak: 'neighbouring' is a stretch: frontend is software development, not a nearby mathematical field.
- **Weak**, retinol: learner weak: “Retinol is not a mathematics concept.” gives no intuitive explanation or example.
- **Weak**, 幸福: learner weak: It only states that 幸福 is not mathematics and never glosses what the word means.
- **Weak**, Zwei Geraden schneiden sich in höchstens einem Punkt.: accuracy weak: The key omits 'distinct' in 'Zwei Geraden', since coincident lines meet in infinitely many points, though the explanation notes this.

#### chemistry · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash). 22 cards; 0 failed to generate; 0 failing a content check; 1 with unexpected flags. Mean cost 128 µ$, median time 2.4 s. Judge: 20 pass, 2 weak, 0 fail.

- **Flags**, photon: relevance: subject, expected neighbouring
- **Weak**, Neutralisation: learner weak: The explanation defines neutralisation clearly but gives no simple example of an acid and base reacting.
- **Weak**, electrolysis of water: learner weak: The definition lacks the required simple example.

#### pronunciation · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash, not calibrated: no verdicts). 16 cards; 0 failed to generate; 0 failing a content check; 1 with unexpected flags. Mean cost 73 µ$, median time 1.5 s.

- **Flags**, ありがとう: language: other, expected ja

#### traditional-haiku · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash). 12 cards; 4 failed to generate; 0 failing a content check; 0 with unexpected flags. Mean cost 399 µ$, median time 5.4 s. Judge: 7 pass, 1 weak, 4 fail.

- **Error**, bank: A module returned content in an unexpected format: The reading is empty.
- **Error**, Schmetterling: A module returned content in an unexpected format: Reading line 1 is missing.
- **Error**, Ich habe meinen Schlüssel vergessen.: A module returned content in an unexpected format: Reading line 1 is missing.
- **Error**, дождь: A module returned content in an unexpected format: The reading is empty.
- **Fail**, bank: error: A module returned content in an unexpected format: The reading is empty.
- **Fail**, Schmetterling: error: A module returned content in an unexpected format: Reading line 1 is missing.
- **Fail**, Ich habe meinen Schlüssel vergessen.: error: A module returned content in an unexpected format: Reading line 1 is missing.
- **Fail**, дождь: error: A module returned content in an unexpected format: The reading is empty.
- **Weak**, 地铁: cut weak: No kireji or dash; only the line breaks weakly separate '春雨敲站台' from '地铁驶入夜色中'.

#### traditional-haiku · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash). 12 cards; 0 failed to generate; 0 failing a content check; 0 with unexpected flags. Mean cost 338 µ$, median time 6.9 s. Judge: 10 pass, 2 weak, 0 fail.

- **Weak**, Schmetterling: cut weak: The dash in 'Auf Flieder — ruht er' splits one phrase rather than juxtaposing two images. · language weak: 'Auf Flieder — ruht er' is unidiomatic German; 'auf dem Flieder' would be natural.
- **Weak**, дождь: form weak: The second line "В окно стучит капля" has six syllables, not seven.

#### modern-haiku · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash). 12 cards; 0 failed to generate; 0 failing a content check; 0 with unexpected flags. Mean cost 204 µ$, median time 3.9 s. Judge: 8 pass, 3 weak, 1 fail.

- **Fail**, autumn: form fail: Lines 1 and 2 end with the rhyme "drain" and "rain".
- **Weak**, Feierabend: turn weak: "draußen zieht ein Zug vorbei" and "die Katze gähnt" extend the same quiet scene without a turn.
- **Weak**, Ich habe meinen Schlüssel vergessen.: language weak: 'das Handy leuchtet leer' is an odd, unnatural German collocation.
- **Weak**, おにぎり: form weak: Lines 2 and 3 both end with 三角, an end-rhyme the form rules out.

#### joke · gpt-6-luna

Gate **failed** (judge deepseek-v4.1-flash). 12 cards; 0 failed to generate; 0 failing a content check; 0 with unexpected flags. Mean cost 210 µ$, median time 4.4 s. Judge: 9 pass, 3 weak, 0 fail.

- **Weak**, The train was late again this morning.: funny weak: The punchline “wanted to make a grand entrance—eventually” is a flat, forced personification.
- **Weak**, Schmetterling: funny weak: The pun is forced and 'die Flügel vorn hat' is a contrived punchline.
- **Weak**, Feierabend: funny weak: The answer 'Weil er jeden Arbeitstag in ein Fest verwandelt' is a flat etymological gloss rather than a real punchline.

