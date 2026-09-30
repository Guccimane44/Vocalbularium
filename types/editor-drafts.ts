import type { DeckLayout, InputType, ModuleInstance, OperationId } from '@vocabularium/contracts';

export type EditorPendingKarteSave = Readonly<{
  operationId: OperationId;
  type: 'save-karte' | 'create-karte';
  payload: Readonly<Record<string, unknown>>;
}>;

export type KarteEditorDraft = {
  route: string;
  karteId?: string;
  deckId: string;
  base: Record<string, string>;
  texts: Record<string, string>;
  seiteIds: string[];
  pending?: EditorPendingKarteSave;
  error?: string;
  errorCode?: string;
};

export type EditorPendingDeckSave = Readonly<{
  operationId: OperationId;
  payload: Readonly<{
    deck: DeckLayout;
    baseSeiteIds: string[];
    confirmation?: string;
  }>;
}>;

export type DeckEditorDraft = {
  route: string;
  deck: DeckLayout;
  baseSeiteIds: string[];
  selectedSeite: string;
  sampleType?: InputType;
  saving?: boolean;
  pending?: EditorPendingDeckSave;
  error?: string;
};

export type ModuleDraft = ModuleInstance;
