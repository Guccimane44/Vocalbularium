import type { DeckConfiguration, InputType, OperationId } from '@vocabularium/contracts';

// A parent card's editable parts (D09): the meanings or the translation, and
// one entry per facet the card has, empty ones included. Any text may be empty.
export type FieldDraft = {
  meanings?: string[];
  translation?: string;
  facets: {
    article?: { singular?: string; plural?: string };
    examples?: Array<{ sentence?: string; translation?: string }>;
    synonyms?: string[];
    antonyms?: string[];
    pinyin?: Array<{ text?: string; pinyin?: string }>;
  };
};

export type EditorPendingPageSave = Readonly<{
  operationId: OperationId;
  type: 'save-page' | 'create-page';
  payload: Readonly<Record<string, unknown>>;
}>;

// Text drafts keyed by component ID. A new page has no components yet, so its
// main key is held separately and its Context and Text values are keyed by the
// deck module instance they fill.
export type PageEditorDraft = {
  route: string;
  pageId?: string;
  deckId: string;
  // The one component being edited on an existing page.
  componentId?: string;
  base: Record<string, string>;
  texts: Record<string, string>;
  // A parent card edited through its fields (D09): the draft per component,
  // and the draft it opened with, as JSON, to tell whether it changed.
  fields?: Record<string, FieldDraft>;
  fieldBase?: Record<string, string>;
  // The structured content each field draft opened from: the save keeps its
  // core's top line, which the server checks against what is stored.
  fieldStored?: Record<string, unknown>;
  mainKey?: string;
  inputs?: Record<string, string>;
  pending?: EditorPendingPageSave;
  error?: string;
  // A message shown inside the field it is about: an empty main key.
  fieldError?: string;
  errorCode?: string;
};

export type EditorPendingDeckSave = Readonly<{
  operationId: OperationId;
  payload: Readonly<{ deck: DeckConfiguration }>;
}>;

export type DeckEditorDraft = {
  route: string;
  deck: DeckConfiguration;
  sampleType?: InputType;
  // The preview dialog is open.
  previewing?: boolean;
  saving?: boolean;
  pending?: EditorPendingDeckSave;
  error?: string;
};
