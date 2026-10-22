// The parts of the Chrome extension API the extension uses, as Chrome
// documents them. Stored and messaged values are unknown or any until checked.

type LocalStorageArea = {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};
type ChromeStorageArea = LocalStorageArea & {
  setAccessLevel(access: { accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }): Promise<void>;
};
type ChromeStorageChange = { oldValue?: unknown; newValue?: unknown };

type ChromeEvent<Listener extends (...args: never[]) => unknown> = {
  addListener(listener: Listener): void;
  removeListener(listener: Listener): void;
};

type ChromeTab = { id?: number; windowId: number; url?: string; title?: string; active: boolean };
type ChromeMessageSender = { id?: string; url?: string; origin?: string; tab?: ChromeTab; frameId?: number; documentId?: string };
type ChromeMenuClick = { menuItemId: string | number; selectionText?: string; frameId?: number; pageUrl?: string; frameUrl?: string };
type ChromeAlarm = { name: string; scheduledTime: number; periodInMinutes?: number };
type ChromeContext = { contextType: string; documentUrl?: string; documentOrigin?: string; tabId: number; frameId: number };
type ChromeInjectionResult<Result> = { result?: Result; frameId: number; documentId: string };

declare const chrome: {
  runtime: {
    readonly id: string;
    // Set only while a callback for a failed call runs.
    readonly lastError?: { message?: string };
    getURL(path: string): string;
    // The response is whatever the receiving listener sent.
    sendMessage(message: unknown): Promise<any>;
    getContexts(filter: { contextTypes?: string[]; tabIds?: number[]; frameIds?: number[] }): Promise<ChromeContext[]>;
    onMessage: ChromeEvent<(message: any, sender: ChromeMessageSender, sendResponse: (response?: unknown) => void) => boolean | void>;
    onInstalled: ChromeEvent<(details: { reason: string; previousVersion?: string }) => void>;
    onStartup: ChromeEvent<() => void>;
  };
  storage: {
    local: ChromeStorageArea;
    session: ChromeStorageArea;
    onChanged: ChromeEvent<(changes: Record<string, ChromeStorageChange>, areaName: 'local' | 'session' | 'sync' | 'managed') => void>;
  };
  alarms: {
    create(name: string, info: { periodInMinutes?: number; delayInMinutes?: number; when?: number }): Promise<void>;
    onAlarm: ChromeEvent<(alarm: ChromeAlarm) => void>;
  };
  contextMenus: {
    create(properties: { id: string; title: string; contexts: string[]; enabled?: boolean }, callback?: () => void): string | number;
    update(id: string | number, properties: { title?: string; enabled?: boolean }, callback?: () => void): void;
    removeAll(callback?: () => void): void;
    onClicked: ChromeEvent<(info: ChromeMenuClick, tab?: ChromeTab) => void>;
  };
  action: {
    setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
    setBadgeBackgroundColor(details: { color: string; tabId?: number }): Promise<void>;
    // Chrome 110 and later.
    setBadgeTextColor?(details: { color: string; tabId?: number }): Promise<void>;
    onClicked: ChromeEvent<(tab: ChromeTab) => void>;
  };
  tabs: {
    create(properties: { url?: string; active?: boolean }): Promise<ChromeTab>;
    get(tabId: number): Promise<ChromeTab>;
    getCurrent(): Promise<ChromeTab | undefined>;
    sendMessage(tabId: number, message: unknown): Promise<any>;
  };
  windows: {
    create(properties: { type?: 'normal' | 'popup' | 'panel'; url?: string | string[]; focused?: boolean; width?: number; height?: number }): Promise<unknown>;
  };
  scripting: {
    executeScript<Args extends unknown[], Result>(injection: {
      target: { tabId: number; frameIds?: number[]; allFrames?: boolean };
      func: (...args: Args) => Result;
      args?: Args;
    }): Promise<ChromeInjectionResult<Awaited<Result>>[]>;
  };
};
