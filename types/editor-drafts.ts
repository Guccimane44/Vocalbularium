import type { DeckLayout, InputType, ModuleInstance, OperationId } from '@vocabularium/contracts';

export type EditorPendingKarteSave = Readonly<{
  operationId: OperationId;
  type: 'save-card' | 'create-card';
  payload: Readonly<Record<string, unknown>>;
}>;

export type KarteEditorDraft = {
  route: string;
  cardId?: string;
  deckId: string;
  base: Record<string, string>;
  texts: Record<string, string>;
  pageIds: string[];
  pending?: EditorPendingKarteSave;
  error?: string;
  errorCode?: string;
};

export type EditorPendingDeckSave = Readonly<{
  operationId: OperationId;
  payload: Readonly<{
    deck: DeckLayout;
    basePageIds: string[];
    confirmation?: string;
  }>;
}>;

export type DeckEditorDraft = {
  route: string;
  deck: DeckLayout;
  basePageIds: string[];
  selectedPage: string;
  sampleType?: InputType;
  saving?: boolean;
  pending?: EditorPendingDeckSave;
  error?: string;
};

export type ModuleDraft = ModuleInstance;
