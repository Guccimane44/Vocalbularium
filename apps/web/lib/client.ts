"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyMutation, available, type AccountState, type Mutation } from "./domain";
export type Library = Omit<AccountState, "receipts"> & { available: number };
type Pending = { id: string; owner: string; mutation: Mutation; error?: string };
const DB_NAME = "vocabularium-device-v1";
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("snapshots");
      r.result.createObjectStore("outbox", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function storage<T>(
  table: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(table, mode);
    const r = action(t.objectStore(table));
    t.oncomplete = () => {
      resolve(r.result as T);
      d.close();
    };
    t.onerror = () => {
      reject(t.error);
      d.close();
    };
    t.onabort = () => {
      reject(t.error);
      d.close();
    };
  });
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const res = await fetch("/api/" + path, {
    method: method ?? (body ? "POST" : "GET"),
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? "Request failed."));
  return data as T;
}
export function deviceId() {
  let id = localStorage.getItem("vocab-device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("vocab-device", id);
  }
  return id;
}
export function useLibrary() {
  const [state, setState] = useState<Library | null>(null),
    [loading, setLoading] = useState(true),
    [signedOut, setSignedOut] = useState(false),
    [online, setOnline] = useState(true),
    [pending, setPending] = useState<Pending[]>([]),
    [error, setError] = useState(""),
    [lastSync, setLastSync] = useState<string | null>(null);
  const current = useRef<Library | null>(null),
    busy = useRef(false),
    running = useRef(false),
    alive = useRef(true);
  const publish = useCallback((s: Library | null) => {
    current.current = s;
    if (alive.current) setState(s);
  }, []);
  const entries = async (owner: string) =>
    (await storage<Pending[]>("outbox", "readonly", (s) => s.getAll())).filter(
      (x) => x.owner === owner,
    );
  const sync = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const canonical = await api<Library>("sync");
      setSignedOut(false);
      setOnline(true);
      localStorage.setItem("vocab-active-owner", canonical.owner);
      let latest = canonical;
      const items = await entries(canonical.owner);
      for (const item of items) {
        if (item.error) continue;
        try {
          const res = await api<{ state: Library }>("mutations", item.mutation);
          latest = res.state;
          await storage("outbox", "readwrite", (s) => s.delete(item.id));
        } catch (e) {
          if (e instanceof ApiError && [400, 404, 409, 410, 422].includes(e.status)) {
            item.error = e.message;
            await storage("outbox", "readwrite", (s) => s.put(item));
          } else throw e;
        }
      }
      await storage("snapshots", "readwrite", (s) => s.put(latest, latest.owner));
      const rest = await entries(latest.owner);
      setPending(rest);
      publish(latest);
      setLastSync(new Date().toISOString());
      setError("");
      if (
        !running.current &&
        latest.jobs.some((j) => j.pages.some((p) => p.status === "reserved"))
      ) {
        running.current = true;
        void api("jobs/run", {})
          .catch((e) => setError(e instanceof Error ? e.message : "Generation paused."))
          .finally(() => {
            running.current = false;
            void sync();
          });
      }
    } catch (e) {
      if (e instanceof ApiError && [401, 410].includes(e.status)) {
        setSignedOut(true);
        publish(null);
        localStorage.removeItem("vocab-active-owner");
        setError(e.status === 410 ? e.message : "");
      } else {
        setOnline(false);
        const owner = localStorage.getItem("vocab-active-owner");
        if (!current.current && owner) {
          const saved = await storage<Library | undefined>("snapshots", "readonly", (s) =>
            s.get(owner),
          );
          if (saved) {
            publish(saved);
            setPending(await entries(owner));
          }
        }
        setError(
          e instanceof ApiError
            ? e.message
            : current.current
              ? "Offline. Your saved words are available."
              : "Cannot reach your library. Check your connection.",
        );
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [publish]);
  useEffect(() => {
    alive.current = true;
    void sync();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 5000);
    const resume = () => void sync();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [sync]);
  async function submit(type: Mutation["type"], payload: Record<string, unknown>) {
    const s = current.current;
    if (!s) throw new Error("Sign in first.");
    const mutation: Mutation = { id: crypto.randomUUID(), type, payload, deviceId: deviceId() };
    const optimistic: AccountState = { ...structuredClone(s), receipts: {} };
    const result = applyMutation(optimistic, mutation);
    await storage("outbox", "readwrite", (store) =>
      store.put({ id: mutation.id, owner: s.owner, mutation }),
    );
    const next = { ...optimistic, available: available(optimistic) };
    await storage("snapshots", "readwrite", (store) => store.put(next, s.owner));
    publish(next);
    setPending(await entries(s.owner));
    await sync();
    const retained = (await entries(s.owner)).find((x) => x.id === mutation.id);
    if (retained?.error) throw new ApiError(409, retained.error);
    return result;
  }
  async function logout() {
    await api("auth/logout", {});
    localStorage.removeItem("vocab-active-owner");
    publish(null);
    setPending([]);
    setSignedOut(true);
  }
  async function discard(id: string) {
    await storage("outbox", "readwrite", (s) => s.delete(id));
    await sync();
  }
  return {
    state,
    loading,
    signedOut,
    online,
    pending,
    error,
    lastSync,
    sync,
    submit,
    logout,
    discard,
  };
}
