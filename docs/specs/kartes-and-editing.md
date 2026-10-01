# Kartes and editing

## Purpose and status

This specification defines the owner-approved main-key behavior shared by captured and manually created kartes. These requirements are pending implementation; [current scope](../product/scope.md) distinguishes them from the supported baseline. Existing browsing, sorting, save, draft, and deletion behavior remains defined by the applicable [MVP editing rules](../history/mvp/MVP-Product-scope.md#8-card-content-page-and-manual-editing).

The [product model](../product/model.md) defines a main key, karte, and seite. [Modules](modules.md#accepted-main-key-input-contract) owns how modules consume the main key. [Select and Add](../MVP-Product-spec-select-and-add.md) owns detailed generation completion, replacement, failure, interruption, and recovery rules.

## Required main key

Every karte has a main key: the editable text used as its generation input. A captured selection supplies the initial value; manual creation requires the user to specify it. A saved manually created karte cannot omit the main key. A new manual draft may begin before the user has entered it.

The main key must appear on the first, front seite. It can coexist with manually written or generated content and must remain visible regardless of whether a module prints input. Other seites may have no content. Matching main keys do not merge kartes or make their identities the same.

## Creation and optional generation

Capture and manual entry are two ways to supply the same karte input. They share module generation capabilities rather than defining different kinds of karte.

Manual creation requires a main key but does not require generation. The user may save the karte and write its seite content manually without clicking the generation button. Explicitly requesting generation evaluates configured modules from that main key. Capture retains its automatic initial generation workflow.

## Editing and generation again

Editing the main key changes the text input for subsequent generation. It does not automatically run modules, remove existing generated or manually written content, or change prior generation outcomes. Editing other seite content does not redefine the main key.

The user must explicitly request generation again to produce content from the updated key. The action uses the main key supplied to the new attempt and interpretation appropriate to that value. It must not silently use the original captured selection or an earlier key's interpretation. Content that remains from earlier attempts can therefore describe a different input from the current key.

Main key edits follow the explicit save and draft-preservation rules for manual editing. Saving a main key edit is distinct from requesting generation. The existing requirement to finish editing with Save or Cancel before a seite retry remains applicable. Save recovery resubmits a save; it does not generate.

## Acceptance scenarios

1. Capturing `john cena` initializes that karte's main key to `john cena`, displays it on the front seite, and uses it for module generation.
2. Manually creating a karte with `john cena` supplies the same generation input. Saving without clicking generation creates no generation attempt and preserves manually entered content.
3. Explicitly requesting generation for the manual karte evaluates its configured modules using `john cena`; manual origin does not disable generation.
4. Changing the main key from `john cena` to `Bismarck` and saving updates the displayed key while preserving existing John Cena content and prior outcomes. No generation request occurs as a side effect.
5. Explicit generation again after that edit uses `Bismarck` and interpretation appropriate to it, rather than the original key. Replacement and failure behavior follow the generation specification for the targeted seite.
6. Editing explanatory text without editing the main key leaves subsequent generation input unchanged.
7. A front seite with no input-printing module, no applicable module output, or a failed generation still displays its main key.

## Implementation details still to specify

The main-key rules do not select a new whole-karte generation action, an exact button label, or a new replacement policy. The supported baseline retries one selected seite after confirmation. Before implementing the new manual generation UI, specify its target selection and first-generation controls, validation and whitespace rules, treatment of main key edits during active generation, and compatibility for existing manually created kartes without input. Keep these decisions consistent with the required main key and existing recovery protections.
