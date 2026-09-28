# MVP Modules

For the MVP, the module set is limited to the five modules below. Deck configuration and manual editing follow the [MVP scope](MVP-Product-scope.md); capture, automatic saving, and generation outcomes follow the [Select and Add specification](MVP-Product-spec-select-and-add.md).

All module names are provisional and may change.

## First-iteration rendering

All module output is rendered as plain text, preserving its line breaks. Wiktionary-style markers such as `==` and `:` in the examples below are literal text, not instructions to produce formatted headings or lists. When multiple module instances produce content on a page, combine their output in configured order with a blank line between non-empty outputs. An inapplicable module contributes no text or separator.

Manual editing uses one plain-text field per page, as defined in the [MVP scope](MVP-Product-scope.md). Richer rendering, editing of separate output blocks, systematic generation-quality evaluation, and detailed generation limits are deferred to later iterations. The five module types and their applicability rules remain part of the first iteration.

## Shared input and applicability rules

Modules operate on the selected text without additional webpage context. When interpretation is needed, Vocabularium automatically determines:

- whether the selection is a word/phrase or a sentence;
- one source language for the selection.

All module instances for that capture use the same input classification and source language. A complete sentence uses sentence modules; a word or phrase uses word/phrase modules. Punctuation alone does not determine the input type. When a spelling exists in multiple languages, the MVP chooses one language automatically rather than producing multiple language interpretations. The language tag, explanation, and examples must agree on that choice. If required interpretation has not yet succeeded, it must be established before dependent modules can run.

For example, `幸福` can occur in Chinese and Japanese. In the examples below it is interpreted as Chinese, so only a Chinese tag and Chinese-word content are produced. Supporting multiple source-language interpretations is deferred beyond the MVP.

Each module evaluates its own applicability to that shared input. An inapplicable module produces no output and is not a failure. Its page remains present even if nothing else produces content there. Failure to perform required interpretation or generation is a failure, not a reason to silently mark a module inapplicable.

Module definitions describe automatically produced content. Manually created or edited content is not restricted by these applicability rules and requires an explicit **Save** on the card content page.

## 1. `<The selected>`

Renders the selected input exactly as selected. No generation is involved.

## 2. `<The selected + original language tag>`

Renders the selected input exactly as selected, followed by the name of its single selected source language on a separate line. For this plain-text iteration, the language name is the tag; the visual country-flag badge is deferred. This module uses language identification but does not generate an explanation or translation. It applies to words, phrases, and sentences.

Example:

**Underlying word:** 幸福, interpreted as Chinese

`<The selected + original language tag>` renders:

```text
幸福
Chinese
```

## 3. `<German explanation>`

Generates and renders an explanation in German of the underlying word or phrase in the selected source language. It does not add explanations for other possible source languages.

If the input is a word or phrase, the explanation should follow Wiktionary style, as illustrated below. This is a format requirement; the module generates its content and does not require a Wiktionary lookup.

Example:

**Underlying word:** 幸福

`<German explanation>` renders:

```text
== Chinesisch (幸福, xìngfú) ==
=== Bedeutungen ===
: [1] Glück; Glückseligkeit; Wohlbefinden
: [2] glücklich; gesegnet
```

If the input is a sentence, this module is not triggered.

## 4. `<German explanation + examples>`

Works in the same way as `<German explanation>`, including its word/phrase applicability and single source language. In addition, it generates an example sentence for each explanation, written in that source language and accompanied by a German translation. It is not triggered for sentence inputs.

Example:

```text
== Chinesisch (幸福, xìngfú) ==
=== Bedeutungen ===
: [1] Glück; Glückseligkeit; Wohlbefinden
: [2] glücklich; gesegnet
=== Beispiele ===
: [1] 她希望孩子们拥有幸福。
:: Sie hofft, dass die Kinder Glück haben.
: [2] 他们过着幸福的生活。
:: Sie führen ein glückliches Leben.
```

## 5. `<Sentence usage>`

For a sentence input, generates and renders a usage example in the selected source language, as illustrated below.

If the input is a word or phrase, this module is not triggered.

Example:

**Underlying sentence:** 我真的很幸福

`<Sentence usage>` renders:

```text
想到我的家人和朋友，我觉得我真的很幸福。
```

## Multiple instances of a module

Every module remains available in the library after being added. Users may add multiple instances on the same page or across pages, and outputs follow the instances' configured order.

Repeated `<The selected>` or `<The selected + original language tag>` instances repeat the same input and, where relevant, the same tag. Repeated generation modules operate independently while sharing the input interpretation. For example, if a card contains two `<Sentence usage>` modules, each instance generates a different sentence-usage example.

Modules determine applicability independently; page completion and retry follow the [page-completion rules](MVP-Product-spec-select-and-add.md#page-completion-and-failure) and [Retry rules](MVP-Product-spec-select-and-add.md#retry-the-current-page) in Select and Add. That document also contains the example of a failed page with two `<Sentence usage>` instances.

## Empty pages

A page may be empty because it has no modules, none of its modules apply, or the user has removed its content manually. Empty pages remain part of the card and appear in its horizontal page-navigation bar. They are valid and can be edited manually.

In the initial **My Deck**, a sentence produces content on page 1 through `<The selected>` and no content on page 2 through `<German explanation + examples>`. This is successful completion. Inapplicability is distinct from the [generation failures defined in Select and Add](MVP-Product-spec-select-and-add.md#page-completion-and-failure).

## Note

All examples above define the intended format only. Actual generated content may vary.
