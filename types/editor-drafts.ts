import type { DeckConfiguration, InputType, OperationId } from '@vocabularium/contracts';

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
