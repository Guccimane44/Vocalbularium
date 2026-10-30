// What the extension's JavaScript shares: what it keeps in storage, the
// messages its pages send the worker, and the account as its views hold it.
import type { BrowserSession, DeckConfiguration, DeckConfigurationSnapshot, LoginResponse, Page, PendingMutation } from '@vocabularium/contracts';
import type { DashboardAccount } from '../extension/dashboard.tsx';

// The account as the worker last read it: the account summary with the
// default deck's configuration, and the recent captures.
// The API names its one account since 0.13.3 (D23); an older API sends no name.
export type StoredAccount = DashboardAccount & { defaultDeckSnapshot: DeckDetail; username?: string; server?: string };

// A selection the worker accepted (capture.js), kept until the server's page
// list shows its page, and offered for recovery while it is not saved.
export type CaptureReceipt = {
  operationId: string;
  state: 'saving' | 'pending' | 'saved';
  createdAt: string;
  // The server has frozen the deck configuration the capture follows.
  prepared?: boolean;
  pageId?: string;
  error?: string | null;
  payload: { session: BrowserSession; mainKey: string; context?: string; snapshot: DeckConfigurationSnapshot };
};

// What the extension keeps in chrome.storage.local, by key. An upgrade drops
// earlier content (recovery.js); other keys are read as unknown.
export type LocalItems = {
  auth?: LoginResponse;
  account?: StoredAccount;
  installationId?: string;
  epoch?: number;
  dataVersion?: number;
  [key: `capture-${string}`]: CaptureReceipt | undefined;
  [key: `save-${string}`]: PendingMutation | undefined;
  [key: string]: unknown;
};

// What the extension keeps in chrome.storage.session.
export type SessionItems = {
  session?: BrowserSession;
  [key: string]: unknown;
};

// A message from the extension's own pages to the worker: its type and what
// that action needs.
export type RuntimeMessage = { type: string; [field: string]: any };
// The worker's answer to most messages.
export type AccessState = { signedIn: boolean; account?: StoredAccount };

// A deck configuration as the account server returns it.
export type DeckDetail = DeckConfiguration & { id: string };
// A deck in a view: its summary from the deck list, or its configuration once
// a view has read it.
export type ViewDeck = DashboardAccount['decks'][number] | (DeckDetail & { moduleCount?: number; pageCount?: number });
// The account as the dashboard holds it: the stored account, the decks read so
// far and, on a page route, the page open.
export type ViewAccount = Omit<StoredAccount, 'decks'> & { decks: ViewDeck[]; pages?: Page[] };
