export type DeckRow = Readonly<{ id: string; name: string }>;
export type LayoutPageRow = Readonly<{ id: string; deck_id: string; position: number; modules: string }>;
export type AccountRow = Readonly<{ id: 1; default_deck_id: string }>;
export type InstallationRow = Readonly<{ id: string; epoch: number; session_id: string }>;
export type CardRow = Readonly<{
  id: string;
  deck_id: string;
  selected_text: string | null;
  created_at: string;
  interpretation: string | null;
}>;
export type PageStatus = 'loading' | 'completed' | 'failed' | null;
export type PageRow = Readonly<{
  card_id: string;
  page_id: string;
  text: string;
  status: PageStatus;
  attempt_id: string | null;
}>;
export type AttemptRow = Readonly<{
  id: string;
  card_id: string;
  page_id: string;
  installation_id: string;
  session_id: string;
  epoch: number;
  modules: string;
  state: 'loading' | 'completed' | 'failed';
  result: string | null;
}>;
export type ReceiptRow = Readonly<{
  sequence: number;
  operation_id: string;
  fingerprint: string;
  result: string;
}>;
