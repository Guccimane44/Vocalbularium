# From capture to card: a worked example with *Ufer*

10 November 2026. Describes `main` at `761bfbd` (release 0.16.4). Companion to the [headers and flags map](headers-and-flags-map.md).

The deck has two modules: German, with its default facets (Article, Examples, Synonyms, Antonyms), and Chinese, with Examples and Pinyin. You select *Ufer* on a page about a river walk, so the sentence around it becomes the Context.

## 1. Capture (extension)

`context-menu.js` and `capture.js` take the selection *Ufer* and its Context. `background-runtime.js` sends them to the local server with an operation ID, so a second click replays the first result instead of making a second page.

## 2. The page is created (server)

`routes.mjs` checks the payload against `packages/contracts`, and the store commits a new page. It has a Main key component (*Ufer*), a Context component, and one empty component per content module, German and Chinese, each marked as generating.

## 3. One request per module (D17)

`generation.mjs` handles each content module on its own. For German, the composer (`compose.ts`) builds one request:

- **The core's prompt.** It asks for the flags first: `kind`, `language`, `gramRole`, then the meanings.
- **A prompt for every facet the module instance has:** Article, Examples, Synonyms and Antonyms. They are all sent, even though no flags are known yet. Each prompt says in words when it applies ("Article: only for a noun").
- **A JSON schema** that joins the core's shape with every facet's shape.

Chinese gets its own separate request, built the same way.

## 4. The model writes (German)

```json
{ "core": { "kind": "word", "language": "Deutsch", "key": "Ufer", "gramRole": "noun",
            "meanings": ["Rand eines Gewässers"] },
  "facets": { "article": "das", "examples": [...], "synonyms": ["Küste", "Strand"], "antonyms": [] } }
```

The model decides the flags here, once, inside this one answer. Chinese decides its own `kind` and `language` ("德语") in its own request, and the two could disagree.

## 5. Validation and the facet check

`generated.ts` checks every part against its shape. Then `facetsFor()` keeps only the facets that apply to the core the model wrote:

- Article needs `gramRole` = noun, so it stays.
- Synonyms and Antonyms are for a word only, so they stay.

If the model had written `gramRole: "verb"` but still filled Article, Article would be dropped and a `generation.facet_mismatch` event logged.

## 6. Formatting and the header

`content.ts` calls the German core's `header()`, which stores:

```js
{ kind: 'word', language: 'Deutsch', key: 'Ufer', gramRole: 'noun' }
```

The core and each facet become markdown, with *Ufer* highlighted. The store stages the result, then publishes it into the German component as `{ type: 'parent', header, core, facets }`. From now on, this header is the only stored copy of the flags.

## 7. Audio

`spoken.ts` finds the spoken parts. German's Pronunciation facet is spoken in `de`, but it isn't on this card, so no audio job starts. If the deck had a Pronunciation module, its `language` flag (`de`) would decide the voice.

## 8. The card is shown

`render.ts` builds the heading from the stored header:

- `language`: **Deutsch**
- `key`: **Ufer**
- `headerLabels` turn `kind: word` into **Wort** and `gramRole: noun` into **Nomen**

`ruledOutOf()` marks the facets the flags rule out. Here none are; on a verb, Article would be dimmed and its Retry disabled.

## 9. Later, a Retry

Each kind of Retry treats the flags differently:

- **Article's own Retry.** `core.read()` rebuilds the core from the header and markdown, including `gramRole: noun`. The store checks that Article still applies, then sends the core to the model, which writes only Article.
- **The core's Retry (D28).** The model rewrites the meanings. The saved flags (the keys of `header(previous)`) replace whatever flags the model writes, so it stays Wort and Nomen.
- **The whole card's Retry.** It starts over from step 3, and the flags may come out different.

## The weak point

The weak point is step 6: the flags exist only as whatever `header()` happened to store. Steps 8 and 9 rebuild them from there without any declared list of what German's flags are. Step 2 of the rework ([plan](../docs/plans/step-2-flag-definitions.md)) addresses this by declaring each core's flags in the catalog.
