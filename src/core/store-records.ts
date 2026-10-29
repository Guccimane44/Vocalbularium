import type { DeckColour, InterfaceLanguage } from '@vocabularium/contracts';
import type { ModuleInstance } from '@vocabularium/domain/modules';

export type DeckRow = Readonly<{ id: string; name: string; view: 'default'; colour: DeckColour | null; ordinal: number }>;
export type DeckModuleRow = Readonly<{ id: string; deck_id: string; position: number; type: string; facets: string[] }>;
export type AccountRow = Readonly<{ id: 1; default_deck_id: string; language: InterfaceLanguage }>;
export type InstallationRow = Readonly<{ id: string; epoch: number; session_id: string }>;
export type PageRow = Readonly<{
  id: string;
  deck_id: string;
  selected_text: string | null;
  created_at: string;
  main_key_sort_key: Buffer;
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
  facets: string[];
  generation: string | null;
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
export type RunRow = Readonly<{ id: string; page_id: string; ordinal: number }>;
export type ReceiptRow = Readonly<{
  sequence: number;
  operation_id: string;
  fingerprint: string;
  result: string;
}>;

// A page summary as read for a list (D05): the page, its main key, its status
// and each component's family mark.
export type PageSummaryRow = PageRow & Readonly<{
  main_key: string | null;
  status: ComponentStatus;
  modules: readonly Readonly<{ type: string; status: ComponentStatus; filled: boolean; content: string | null }>[] | null;
}>;

// The module an attempt generates (D08): the parent instance and the facets it
// had when the attempt started. A facet's own Retry (0.7.3) also records that
// facet and how to put the component back if it fails; a card's Retry, the
// core it had, whose reading to keep (D19).
export type AttemptModule = ModuleInstance & Readonly<{
  retry?: string;
  prior?: Readonly<{ status: ComponentStatus; waiting: boolean }>;
  previous?: Readonly<Record<string, unknown>>;
}>;
// The model and prompt version that produced a part of a component (D11).
export type GenerationEntry = Readonly<{ model: string | null; prompt: string }>;
export type GenerationRecord = Readonly<Record<string, GenerationEntry>>;
// A provider result staged on its attempt, structured content when it succeeded (D09).
export type AttemptResult = Readonly<{ ok: boolean; content?: unknown; generation?: GenerationEntry }>;
export type Attempt = Omit<AttemptRow, 'module' | 'result'> & Readonly<{ module: AttemptModule; result: AttemptResult | null }>;
