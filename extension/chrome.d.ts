type LocalStorageArea = {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

declare const chrome: { storage: { local: LocalStorageArea } };
