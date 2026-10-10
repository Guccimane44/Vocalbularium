export type DeckRow = Readonly<{ id: string; name: string; view: 'default' }>;
export type DeckModuleRow = Readonly<{ id: string; deck_id: string; position: number; type: string }>;
export type AccountRow = Readonly<{ id: 1; default_deck_id: string }>;
export type InstallationRow = Readonly<{ id: string; epoch: number; session_id: string }>;
export type PageRow = Readonly<{
  id: string;
  deck_id: string;
  selected_text: string | null;
  created_at: string;
}>;
export type ComponentStatus = 'loading' | 'completed' | 'failed' | null;
export type ComponentRow = Readonly<{
  page_id: string;
  id: string;
  module_instance_id: string;
  module_type: string;
  position: number;
  content: string;
  status: ComponentStatus;
  attempt_id: string | null;
}>;
export type AttemptRow = Readonly<{
  id: string;
  page_id: string;
  component_id: string;
  run_id: string;
  installation_id: string;
  session_id: string;
  epoch: number;
  module: string;
  state: 'loading' | 'completed' | 'failed';
  result: string | null;
}>;
export type ReceiptRow = Readonly<{
  sequence: number;
  operation_id: string;
  fingerprint: string;
  result: string;
}>;
