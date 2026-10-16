import type { DeckConfiguration, InputType, OperationId } from '@vocabularium/contracts';

// A parent card's editable parts (D09, amended): the core's markdown and one
// markdown text per facet the card has, empty ones included.
export type FieldDraft = { core: string; facets: Record<string, string> };

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
  // A parent card in the live editor (D09, amended): its draft per component,
  // the draft it opened with as JSON (to tell whether it changed), and the
  // content it opened from (whose top line a save keeps; the server checks it).
  fields?: Record<string, FieldDraft>;
  fieldBase?: Record<string, string>;
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
