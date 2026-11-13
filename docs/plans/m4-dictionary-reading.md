# M4: facets written from a Wiktionary entry

Drafted 12 November 2026 for the owner's review. Status: **draft**. Follows [M3](../history/evidence/m3-cost-per-facet.md) and the owner's direction of 12 November 2026: send the costly facets to Wiktionary, read by a model rather than copied. It extends the [split facets plan](split-facets.md), whose German lookup was deferred until after Phase 1.

Revised 12 November 2026 after the owner's review of the lookup's design: [the lookup in the product](#the-lookup-in-the-product) records how the dictionary is stored and looked up, in the cloud and with many languages. The German tables become the first product step, and M4 adds an arm with the German Wiktionary and a measure of the import's size.

Revised again on 12 November 2026 after three inputs from the owner and a [coverage check of the German Wiktionary](../history/evidence/m4-german-wiktionary-coverage.md):
- **Each module reads its own language's Wiktionary:** German from the German Wiktionary, English from the English Wiktionary.
- **The facets are provisional**, so the import keeps a general entry, not one shaped by today's facets.
- **A key often isn't the dictionary's headword** (*went*, *ging*, *Reader* and *reader*). [Finding the main word](#finding-the-main-word) says how the lookup gets from one to the other.

The coverage check found the right main word for 40 of 41 inflected keys, and German tables that agree with the expected forms on nearly every word.

## Question

When a facet request is given the matching part of a Wiktionary entry to read, is the facet:
- **as good or better** than today's facet request, which has no entry;
- **cheaper**, because the model chooses from the entry instead of recalling, so it reasons less;
- **no slower?**

Some facets may need no model at all: German's grammar tables can come straight from the entry. M4 tests that too.

## Why not a pure lookup

The [Wiktionary experiment](../history/evidence/wiktionary-english-experiment.md) of 9 November copied entries into the card and passed 15 of 41 cards, against 36 for today's request. Its failures were all reading failures:
- glosses that aren't senses (*past participle of rin*);
- rare senses first;
- synonyms of every sense mixed together (*block* for *bank*);
- etymologies that were too long or for the wrong sense.

Its tables, origin-language lists and language picks were good. So in M4 the entry is **material the model reads**, not text the card shows. The exception is the tables.

## How a facet is written from an entry

No agent and no tool calls: the steps are fixed, so code does the fetching and the model does only the reading.

1. **The lookup word.** It comes from the core, which is already written in the split:
   - the selection, when it is in the module's language;
   - otherwise the module's word for the first meaning, `contextual` first, as Etymology and the German grammar facets already define it (German `facets.prompt.md`, English Etymology's prompt).

   The core gives the selection and its meanings, but not that word on its own line. M4 asks a small model for it, at `reasoning_effort: none`, with the core as input. If that works, Phase 3 can add it to the core instead.
2. **The entry.** The word is looked up in the Wiktextract data of the module's own language's Wiktionary, under that language:
   - German entries from the German Wiktionary (`de-extract.jsonl`, as in the coverage check);
   - English entries from the English Wiktionary (the kaikki.org per-word files, as on 9 November).

   The lookup returns every candidate main word, as described in [finding the main word](#finding-the-main-word). The core's word and part of speech choose among them, and for a German noun its gender does too.
3. **The cut.** Only the part the facet needs is kept:

   | Facet | What the request gets from the entry |
   | --- | --- |
   | Synonyms, Antonyms (one request) | Each sense's gloss with its own synonym and antonym lists, plus the entry-wide lists marked as such |
   | Etymology | The etymology section of the entry whose senses match, and every entry's etymology when there are several, with their sense glosses |
   | Declension, Article, Comparison | The forms table, with its tags (case, number, gender, degree) |
   | Conjugation | The forms table, with its tags (person, number, tense, mood) |

   The entry is passed as plain lines, not as Wiktextract's JSON, to keep the input short. Anything over about 1,500 tokens is cut, senses first in the entry's own order.
4. **The request.** It is the split's facet request as now committed, with two additions:
   - a `dictionary` field in the input holding the cut;
   - one sentence in the facet-only instructions: *Use "dictionary" as the source: choose what fits the card's meaning, leave out what doesn't, and never add what it doesn't support.*

   With no entry, or nothing for the facet, the request is sent exactly as today.

**Tables without a model** (arm T): for German Declension, Article, Comparison and Conjugation, code fills the facet's shape directly from the German Wiktionary's forms table. For example:
- Declension: the four cases × singular and plural, with articles;
- Article: from the gender tag.

A model is used only when a word has more than one entry (*der See* and *die See*; *Band* has three): a request at `none` reasoning picks the one matching the core. Where the table lacks a form the shape needs, the facet goes to the model as in arm D. The coverage check found three cases that need handling:
- **a merged table:** *übersetzen*'s two verbs carry one table holding both *übersetzt* and *setzt über*, so such a verb goes to the model;
- **reflexive verbs:** they are filed without *sich*, so the lookup drops it;
- **plural-only nouns** (*Eltern*, *Leute*): they have no gender, so their Article is *die* for the plural.

## Arms

Every arm uses the same cores: the 42 part-2 cores of [M3's confirmation run](../history/evidence/m3-cost-per-facet.md), already written and judged. Only the facet requests are sent again. That removes core variation from the comparison and needs no new core requests.

| Arm | Facets |
| --- | --- |
| **F, today's facet request** | Synonyms + Antonyms, Etymology, Declension, Article, Comparison, Conjugation, as M3 sent them, at `low`; sent again on the same day as the others, for a same-day baseline |
| **D, with the dictionary** | The same requests with the entry's cut added, at `low`. The cut comes from the module's own Wiktionary: the German Wiktionary for German, the English Wiktionary for English |
| **T, tables** | German Declension, Article, Comparison and Conjugation from code, as above |
The earlier arm DG (German Synonyms + Antonyms from the German Wiktionary) is now arm D for German. The coverage check showed why: in the German Wiktionary, 76 % of entries have synonyms and 66 % have antonyms, almost all tied to a sense number. In the English Wiktionary on 9 November, 13 of 41 entries had synonyms and 6 had antonyms, none tied to senses.

Arm T is also tested apart from the cards: its mapping from the entry's tags to each facet's shape runs over a list of German nouns, verbs and adjectives, and every table must pass the facet's `checks`. The coverage check has already compared the table's key forms with the 115 headwords of `tests/golden/held-out/lookup-german.json`:
- verbs: 41 of 41 agree;
- noun genitives: 56 of 56;
- noun plurals: 55 of 56;
- adjective comparison: 19 of 19.

What's left is the mapping into each facet's whole shape, over a few hundred words.

Modules: German (all six facets) and English (Synonyms + Antonyms and Etymology). Chinese is left out: its Etymology describes characters, which the English Wiktionary covers thinly, and the Chinese Wiktionary's extract hasn't been looked at.

## What is recorded and judged

Per facet request:
- whether an entry was found, the cut's length in tokens, and the lookup word;
- input, reasoning and visible output tokens, and cost (`list_cost`);
- time;
- whether the facet came back empty, and failures.

Per card: the M3 card with only these facets replaced by each arm's. It is judged whole against the module's `rubric.md`, so the comparison with M3's verdicts is like for like, and checked by the content checks. The judge's per-criterion verdicts (`facets`, `etymology` and the German grammar facets) are reported per arm.

The judge was too lenient on antonyms in the follow-up of 11 November, and the owner finds it too strict elsewhere. So it is not the only evidence:
- **The owner's review in the extension** (see [review in the extension](#review-in-the-extension)).
- **Checks against the entry:**
  - for T and D, each German form must be found in the entry's table;
  - for D, a synonym or antonym that the entry doesn't list is counted (it may still be right, but it is no longer the dictionary's).

### Review in the extension

A script writes the arms' cards into one deck, *M4 review*, on the owner's local backend, through the store and with no generation. The owner then reads them as a learner would.

- **One page per key and arm, next to each other.** Arms are labelled X, Y and Z in an order shuffled per key, so a page doesn't say which arm wrote it. The key to the labels stays in `.data/m4/`.
- **The entry is shown on the page.** The dictionary's cut sits in the page's Context, so a form or synonym can be checked against it without leaving the card.
- **Marks are recorded.** In each page's Context the owner writes which of X, Y and Z is right, or what is wrong. The script reads the marks back from the deck afterwards.
- **The deck is test data.** It is deleted after the review and never shared.

The judge runs on the same cards, so the two can be compared.

## Inputs and cost

- **Inputs:** 42 cores per module, about 30 word cores each (the facets are for words only).
- **Requests:** about 6 facet requests per German card and 2 per English card, in 2 model arms (F and D), plus the lookup-word requests: about 600 requests, short.
- **Data:**
  - **German:** the German Wiktionary's extract, already downloaded for the coverage check (`.data/m4-coverage/`, 310 MB compressed, 1.8 GB trimmed to German);
  - **English:** about 40 English entries from kaikki.org's per-word files, kept under `.data/m4/entries/`, at one request a second.

  Nothing about the owner is sent.
- **Import size:** the trimmed German file is loaded into Postgres once, to measure its size there and the time it takes. It isn't kept in the database afterwards. Trimming the dump takes about 30 seconds.
- **Judge:** about 270 cards.
- **In all:** about 1 hour at 8 cards at a time, and about $2.

## What counts

- **A facet moves to the dictionary** if D or T, against F:
  - is judged at least as well;
  - has fewer forms or synonyms that the entry doesn't support;
  - and costs no more.
- **Cost:** D is cheaper only if its reasoning falls by more than the cut adds in input. At about $0.26 per million input tokens and $0.97 per million output tokens, a 1,000-token cut pays for itself if reasoning falls by about 270 tokens. M3's facet requests reasoned 200–870 tokens.
- **Coverage:** the share of lookup words with an entry, and with the facet's part in it. Low coverage limits the saving, whatever the quality.
- **T is enough for a German grammar facet** if its forms match the entry, which is true by construction, and the judge and your review find no wrong forms. Wiktionary's own errors are counted separately.

## The lookup in the product

This is the design M4's results feed into. It needs a decision record of its own before it is built.

**A copy of the dictionary beside the backend, not a call per card.** The backend keeps its own copy of the chosen Wiktionary extracts in Postgres. A live call per card, to the Wiktionary API or to kaikki.org's per-word files, was considered and rejected:
- the Wiktionary API returns wikitext, so we would have to parse the tables ourselves, which is Wiktextract's job;
- kaikki.org's per-language files are marked deprecated, and it is a volunteer site with no promise of availability;
- each call adds time, rate limits and an outside service to every card, and every looked-up word leaves our system.

This holds when the backend moves to the cloud. There it becomes one copy shared by every account, because dictionary data is not account data, and more users add lookups, not storage.

**Storage.** A migration adds the tables; the data comes from an import, not from migrations:

```sql
dictionary_imports (id, edition, lang_code, extracted_at, imported_at, active)
dictionary_entries (import_id, lang_code, word, word_folded, pos, etym_no,
                    gender, senses jsonb, forms jsonb, etymology text, sounds jsonb)
  partitioned by lang_code; index (import_id, word_folded)
```

- **The entry is kept general, not shaped by today's facets**, because the facets will change (owner, 12 November 2026). It keeps:
  - senses with their tags and links;
  - forms with tags;
  - synonyms, antonyms and the other lists of related words, with their sense numbers;
  - etymology, IPA and hyphenation.

  Only what no facet is likely to read is dropped: translations into other languages, descendants, categories and templates. A new facet then means a new `cut` or `fill`, not a new import. If it needs a field that was dropped, the language is imported again, which is a routine command.
- **One partition per language, imported only when a module needs it.** A language is rebuilt, updated or dropped without touching the others.
- The dictionary stays outside account backups and upgrades. Discarding cards never touches it, and it can always be rebuilt from the dump.

**Import.** `npm run dictionary:import -- <languages>` locally, and a scheduled job in the cloud:
- it streams the extract and keeps only the module languages (the English Wiktionary's combined file is 2.9 GB compressed and 24.8 GB uncompressed);
- it loads into a new import, then switches the active import in one transaction, so a lookup never sees half an import;
- it pins the extract's date, which is stored on the import;
- it writes a coverage report per language: the share of the module's golden-set words with an entry, and with each facet's part.

Trimmed, all languages together should come to a few GB (an estimate; M4 measures German). That is small for a managed Postgres. If it ever outgrows it, the fallback is one read-only file per language in object storage, with the same design.

**Lookup.** `src/server/dictionary.mjs` runs indexed queries by language and the folded word, a few milliseconds. With no dictionary imported, or no entry, every facet is requested as today. A missing or stale dictionary makes a card cost more, but never breaks it.

### Finding the main word

Wiktionary has no central record for a word: each spelling is its own page, and page titles are case-sensitive. The extract does link pages to each other, and the lookup follows those links:

| Link | Where it is | Example |
| --- | --- | --- |
| An inflected form's own entry points to its main word | `form_of` on its senses | *ging* → *gehen*; *Häuser* → *Haus* |
| A spelling variant points to its main form | `alt_of` on its senses | *COVID-19* → *Covid-19* |
| A main word lists all its forms | `forms` on its entry | *gehen* lists *ging* and *gegangen*; *anrufen* lists *rief an* |
| A page was moved | `redirects` (German Wiktionary) | — |

**The import builds a second table, from each form to its main word**, filled from both directions:
- each form's own `form_of` and `alt_of` links;
- every form in every main word's table, with article and pronoun stripped (*er/sie/es ging* gives *ging*).

```sql
dictionary_forms (import_id, lang_code, form_folded, lemma, pos, source)  -- source: form_of | alt_of | table
  index (import_id, lang_code, form_folded)
```

Name entries (`pos: name`) are left out of it: in the coverage check, they linked *Häuser* to the surname *Häusser* and *war* to *Waray*.

**A lookup returns every candidate main word, and the core chooses.** For a key, the lookup:
1. strips surrounding punctuation, a leading article, and a leading *sich*;
2. finds entries for the key without regard to case. *Essen* and *essen*, or *Weg* and *weg*, are two words, and both come back;
3. adds every main word from the forms table.

The candidates are then narrowed by the core's word, its part of speech and, for a German noun, its gender. Any that remain go to the model in the cut, or to the model without a table.

Several main words are common, and both routes are needed. In the coverage check:
- the direct `form_of` link alone found 36 of 41 inflected keys;
- the forms table found the other five (*gewesen* in both sets, *am besten*, *angekommen*, *freute sich*);
- several keys reached more than one candidate: *gewesen* is also an adjective, *Müttern* also a verb, and *Strasse* also reaches *Strass*, rhinestone.

That is why the core has to name the word, not just the selection.

**The lookup word comes from the core.** The core gets a `grammarWord` field, the word German's `facets.prompt.md` already defines, and for a German noun its `gender`, which picks between entries such as *der Junge* and *das Junge*. That is a change to the core's prompt, so it goes through the prompt snapshots and the gate. M4 still uses a model's pick, to reuse M3's cores.

**What a facet takes from the entry is the facet's own code.** A facet that uses the dictionary gets `facets/<facet>/dictionary.ts` with two pure functions in `packages/domain`:
- `cut(entries, core)`: the plain lines its request reads, at most about 1,500 tokens;
- `fill(entries, core)`: optionally, the facet's whole value, or nothing.

A filled value still goes through `domain/generated.ts` and the facet's `checks`; if it fails them, the facet is requested with the cut instead. The contract still names no facet.

**Retry and recovery.** The lookup gives the same answer every time, so recovery just repeats it. A Retry of a filled facet would give the same table, so it goes to the model with the cut instead.

**Credit.** Each facet built from the dictionary stores its source (edition, extract date, lookup word), and the card shows "From Wiktionary" with a link. That is a stored shape (a migration), a contract change (`docs/api/openapi.json`) and a localised string.

**Many languages.** Storage grows little with each language; most of Wiktionary's entries are in a few dozen languages. What grows is the work per language:
- **Each language with grammar tables needs its own mapping** from the entry's tags to its facets' shapes, with tests: German has case and number, Russian adds animacy and aspect, Finnish has 15 cases, Arabic has broken plurals. This is most of the cost of adding a language.
- **Coverage varies.** By default, each module reads its own language's Wiktionary, which describes its words more fully: German's has per-sense synonyms and full conjugation tables. But each edition has its own format, and Wiktextract reads only about a dozen editions well. Where a language's own edition isn't one of them, its module falls back to the English Wiktionary or to no dictionary.
- **So the dictionary is opted into per module and per facet**, only where a measurement like M4 shows it helps. Large languages with grammar facets get table mappings; smaller ones get the cut or no dictionary, and the model writes their facets as today. Dictionary-backed facets are not promised for every language.

**Order of work.**
1. **German tables (arm T).** Declension, Conjugation, Article and Comparison filled by code, about 15 % of a German card's cost (M3: about 390 µ$ of 2,601). It doesn't depend on the split's decision: under D17's single request, these facets are left out of the request and filled from the dictionary after it.
2. **The cut (arm D)** for Etymology and Synonyms + Antonyms, only for the modules and facets where M4 shows it is cheaper and at least as good.
3. **Credit**, with the first step that shows dictionary content on a card.

Rough effort: the import, tables and lookup 1–2 days; the German table mappings 2–3 days; the cut in the composer 1–2 days; credit 1–2 days; Retry and recovery tests 1 day. CI uses a small dictionary fixture in `tests/fixtures/` and never downloads a dump.

## Limits

- **One sample**, and the judge as it is: not recalibrated, and uncalibrated for English (US).
- **The lookup word is a model's pick in this run.** In the product it comes from the core.
- **The coverage check used held-out sets of common words**, whose forms are still unreviewed drafts. Rare words, long compounds and colloquial forms are untested, and the English Wiktionary wasn't downloaded for it.
- **Licence.** Wiktionary is CC BY-SA. A card built from it has to credit it, and BY-SA may apply to the card's text. Hosting a copy in the cloud and serving cards from it to other people is a clearer case of distribution than a local install. That is for you to decide before the product uses it. M4 only measures.
- **Import size is measured for German only**, and lookup speed is not measured.

## Questions for you

Answered by the owner on 12 November 2026:

1. ~~Modules?~~ German and English, with Chinese left out.
2. ~~Arm D0?~~ Dropped: only `low`.
3. ~~How is it reviewed?~~ The judge and the owner's review. The owner reviews in the extension, in an M4 deck built from the arms' cards, instead of a review sheet (see [review in the extension](#review-in-the-extension)).
4. ~~Credit?~~ None for now: this is testing and development. Credit comes back before dictionary content reaches anyone else.
5. ~~German tables first?~~ Yes: the German tables are built first as a product step and reviewed by the owner, then M4 runs.
6. ~~Which Wiktionary per module?~~ Each module reads its own language's Wiktionary.
