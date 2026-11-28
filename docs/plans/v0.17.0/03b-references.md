# Step 3b: References (German)

Scope agreed in the [master plan](README.md) (owner, 2026-11-26). The full plan is written when this step starts; the research below was done early, because its answers decide the step's shape.

The second pillar. Etymology, synonyms and antonyms are written with a dictionary entry beside the request, as facts for the model to draw on. A reference is never copied into a card. This step settles a source for each of the three facets, builds the lookup, and shows how much a reference helps, so steps 4 to 6 can measure each facet with and without one.

## Why these three facets

- **Etymology** is the hardest facet for every model, and the one the judge is worst at catching (see the [master plan](README.md#what-we-know-already)). Haiku invents histories that read like dictionary entries: Ufer "related to über", Plan from Latin "planum".
- **Synonyms** are often weak: near-synonyms, or synonyms of another sense.
- **Antonyms** fail when a merely related word is given as an opposite.

These three are open lists or free text, which the step 1 scorer cannot check. The closed facets (article, declension, conjugation, comparison, case) are not assisted: the scorer already checks them, and the picker handles them.

## Sources, and what their terms allow (read 2026-11-26)

| Facet | Source | Licence | Can we use it? |
| --- | --- | --- | --- |
| Etymology | Wiktionary: the German Wiktionary's "Herkunft" section, then the English Wiktionary's "Etymology" | CC BY-SA | yes, with credit and the same licence; the source for now (owner, 2026-11-26) |
| Etymology, later | Pfeifer, *Etymologisches Wörterbuch des Deutschen*, on DWDS | rights lie with the BBAW | only with the BBAW's written permission; replaces Wiktionary if they say yes |
| Synonyms | OpenThesaurus | LGPL or CC BY-SA 4.0 | yes, with a link to openthesaurus.de |
| Antonyms | OpenThesaurus (some), Wiktionary (more) | as above | yes; coverage not yet checked |

**DWDS and Pfeifer**, from [Nutzungsbedingungen](https://www.dwds.de/d/nutzungsbedingungen), [Urheberrechte im DWDS](https://www.dwds.de/d/urheberrechte) and [Zitieren des DWDS](https://www.dwds.de/d/zitieren):

- Reading the site is free for anyone.
- Any use of DWDS content, "including but not limited to automated queries and evaluation (crawling, parsing, text and data mining)", needs explicit permission, unless § 60d UrhG (text and data mining for non-commercial scientific research) covers it. The BBAW reserves its rights under § 44b, the general text-and-data-mining exception.
- Any other reuse, whole or in part, also needs permission. Results taken from DWDS name their source and stay within the size of a normal quotation.
- The rights to Pfeifer's dictionary lie with the BBAW; only content DWDS wrote itself is free.
- DWDS has no etymology API: its API page says much of its data cannot be opened that way for legal reasons.
- Requests go through <https://www.dwds.de/kontakt>.
- The citation for one entry: „<Stichwort>“, in: Wolfgang Pfeifer et al., Etymologisches Wörterbuch des Deutschen (1993), digitalisierte und von Wolfgang Pfeifer überarbeitete Version im Digitalen Wörterbuch der deutschen Sprache, <URL>, abgerufen am <Datum>.

**What follows for work already done.** Step 2's grading subagents and a timing test fetched DWDS pages with scripts: a few hundred pages, for our own checking, with nothing published. That is at best a grey area under § 60d. From now on no script fetches DWDS until permission covers it; a check against Pfeifer is done by a person in a browser.

**Wiktionary** is the etymology source for now (owner, 2026-11-26). Its text is under CC BY-SA (and the GFDL): free to use, change and pass on, with credit and the same licence. It is read through the MediaWiki API, which asks automated clients for a descriptive User-Agent and a modest request rate; the lookup keeps to both, with a generic client name and the project's URL rather than anyone's personal details. Its etymologies are less reliable than Pfeifer's: they are written by volunteers, are sometimes missing or thin, and German Wiktionary's "Herkunft" sections often cite Pfeifer or Kluge without their detail. So numbers measured with Wiktionary are a floor: Pfeifer would do at least as well.

**OpenThesaurus**, also shown on DWDS for synonyms, is a separate project under a free licence. Its data may be used, changed and passed on, as long as what is passed on stays under the same licence and names openthesaurus.de with a link. It offers its own downloads and API, so nothing comes through DWDS.

## Permission from the BBAW

This no longer blocks development (owner, 2026-11-26): the step is built and measured with Wiktionary, and Pfeifer replaces it only if the BBAW says yes. The owner writes to the BBAW in parallel and asks:

1. May the tool look up the Etymologie section of a word when a user saves it, and show a short version in its own words, with the citation, in that user's card?
2. If not, is there a licence or a data export (the TEI version) of Pfeifer's dictionary for this use, and on what terms?
3. May we fetch a few hundred entries by script to check our own test cards (nothing published)?

A draft of the message is at the end of this plan.

**If they say no,** etymology stays on Wiktionary. Nothing waits for this answer.

## The lookup

- **Live** (owner, 2026-11-26). Each card looks its selection up at generation time, so it always uses the source's current entry, and nothing is copied onto the computer. A lookup has a short time limit (2 seconds by default); one that times out counts as "no entry found".
- **Privacy.** The selected word, never the user's sentence, goes to the source. The privacy rules in the code standards get a line naming each source.
- **One function per source**: the selection and its language in, its entries or "none" out. It runs outside any database transaction, like every provider call. For OpenThesaurus it uses its public API, within the API's stated limits; for Wiktionary, the MediaWiki API within its limits; for Pfeifer, only what the BBAW allows. Each source sits behind the same function, so Pfeifer can replace Wiktionary without changing anything else.
- **When no entry is found** (owner, 2026-11-26): synonyms and antonyms are written by the model their "without reference" difficulty calls for; etymology is left out.
- **The word to look up is the selection** (owner, 2026-11-27, [selection facets](../selection-facets.md)), in its own language: a German selection in the German Wiktionary, a foreign one in its language's entry in the English Wiktionary. OpenThesaurus covers only German selections. The lookup always runs before generation, so a card is one request (see the [master plan](README.md#how-the-pillars-fit-together)).
- **Credit on the card.** Each assisted facet carries its source's credit line (for example "nach OpenThesaurus"). This changes the card screen, so the screen reference and the screens check follow.

## Reference, not copy

- **The prompt** for each assisted facet: take facts from the reference; write the card's own plain German; add nothing the reference does not support; keep its uncertainty ("wohl", "unklar"). For synonyms and antonyms: choose the entries that fit the card's meanings, never the whole list.
- **A content check** compares each assisted facet with its reference and flags a long word-for-word run.
- **The rubric** for each assisted facet: it agrees with its reference; an added fact fails.
- **The judge** is given the reference with the card. Step 3 measures the judge both ways on etymology, so we know what the reference adds to judging too.

## Prototype

Before any of this is built, a prototype shows whether references help enough. Nothing is shipped.

1. **Synonyms and antonyms** from OpenThesaurus, within its API's limits: German's calibration cards with a synonyms or antonyms fault, and as many that pass. Haiku writes the facet from the entries; the new facets are graded against DWDS by hand, as in step 2.
2. **Etymology** from Wiktionary, looked up by the selection in its own language: German calibration cards with a German key, and foreign keys such as *window*, *refrigerator*, 经济 and тоска. The facet is judged only for agreeing with its entry, not for being true (owner, 2026-11-27): step 3 showed even Opus cannot verify an etymology from memory. A card says what the entry says and adds nothing; no entry means no etymology. Where the facet and its entry disagree, a person checks it in a browser. No script fetches DWDS.

**Worth building if:** the etymology says what its entry says on at least 90% of the cards, with no fact the entry lacks; the synonyms and antonyms pass on at least 90% of the former fails, with no former pass now failing; and the text reads well for a learner (the owner checks a sample).

**Also measured:** how often a selection has no entry (Wiktionary has no etymology for many words), which sets how much the "without reference" difficulty matters.

## What this step hands on

- Steps 4 and 5 run each model with and without references on the three assisted facets.
- Step 6 gives each assisted facet two difficulties.
- Step 7 builds the lookup into generation, the one-or-two-request flow, and the picker together.

## Open questions for the owner

1. Will you write to the BBAW? It no longer blocks anything.

## Draft message to the BBAW (German)

> Betreff: Anfrage zur Nutzung des Etymologischen Wörterbuchs (Pfeifer) in einem nichtkommerziellen Vokabeltrainer
>
> Sehr geehrte Damen und Herren,
>
> ich entwickle Vocabularium, eine nichtkommerzielle Browser-Erweiterung zum Vokabellernen. Nutzerinnen und Nutzer markieren ein Wort auf einer Webseite und erhalten eine Lernkarte, unter anderem mit einer kurzen Wortgeschichte. Diese Wortgeschichten erzeugt derzeit ein Sprachmodell, das dabei häufig Herkünfte erfindet.
>
> Ich möchte die Wortgeschichte stattdessen auf das Etymologische Wörterbuch des Deutschen stützen. Der Eintrag diente dem Modell nur als Quelle; in der Karte stünde eine kurze, eigenständig formulierte Fassung mit vollständiger Quellenangabe. Daher frage ich:
>
> 1. Darf die Erweiterung beim Erstellen einer Karte den Etymologie-Abschnitt des betreffenden Wortes abrufen und so verwenden?
> 2. Falls nicht: Gibt es eine Lizenz oder einen Datenexport (etwa die TEI-Fassung) des Etymologischen Wörterbuchs für eine solche Nutzung, und zu welchen Bedingungen?
> 3. Dürfen wir zur Prüfung unserer eigenen Testkarten einige Hundert Einträge automatisiert abrufen? Die Ergebnisse werden nicht veröffentlicht.
>
> Die Abfragen wären gering: ein Abruf pro gespeichertem Wort, zum Zeitpunkt des Speicherns. Gern beschreibe ich das Vorhaben genauer.
>
> Mit freundlichen Grüßen
> <Name>
