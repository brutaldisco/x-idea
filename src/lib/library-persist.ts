import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";
import { isLibrarySourcesData } from "@/lib/library-cache";

export const LIBRARY_PERSIST_KEY = "marginalia.library.v6";
export const LIBRARY_PERSIST_BUSTER = "2026-09-09";
export const LIBRARY_PERSIST_MAX_PAGES = 8;
const LEGACY_KEYS = ["marginalia.library.v5"];

const DB_NAME = "marginalia";
const STORE = "kv";

let persistDisabled = false;

export function dropLegacyLibraryPersist(): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}

export function trimPersistedSources(
  client: PersistedClient,
  maxPages = LIBRARY_PERSIST_MAX_PAGES,
): PersistedClient {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((query) => {
        if (query.queryKey[0] !== "sources") {
          return query;
        }
        const data = query.state.data;
        if (!isLibrarySourcesData(data) || data.pages.length <= maxPages) {
          return query;
        }
        return {
          ...query,
          state: {
            ...query.state,
            data: {
              ...data,
              pages: data.pages.slice(0, maxPages),
              pageParams: data.pageParams.slice(0, maxPages),
            },
          },
        };
      }),
    },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb"));
  });
}

function idbGet(key: string): Promise<PersistedClient | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db
          .transaction(STORE, "readonly")
          .objectStore(STORE)
          .get(key);
        req.onsuccess = () => {
          resolve(req.result as PersistedClient | undefined);
        };
        req.onerror = () => reject(req.error ?? new Error("idb get"));
      }),
  );
}

function idbSet(key: string, value: PersistedClient): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db
          .transaction(STORE, "readwrite")
          .objectStore(STORE)
          .put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error("idb set"));
      }),
  );
}

function idbDel(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db
          .transaction(STORE, "readwrite")
          .objectStore(STORE)
          .delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error("idb del"));
      }),
  );
}

export function createLibraryPersister(): Persister {
  if (typeof indexedDB === "undefined") {
    return {
      persistClient: async () => undefined,
      restoreClient: async () => undefined,
      removeClient: async () => undefined,
    };
  }
  return {
    persistClient: async (client) => {
      if (persistDisabled) {
        return;
      }
      try {
        await idbSet(LIBRARY_PERSIST_KEY, trimPersistedSources(client));
      } catch {
        persistDisabled = true;
        try {
          await idbDel(LIBRARY_PERSIST_KEY);
        } catch {
          return;
        }
      }
    },
    restoreClient: async () => {
      try {
        return await idbGet(LIBRARY_PERSIST_KEY);
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await idbDel(LIBRARY_PERSIST_KEY);
      } catch {
        return;
      }
    },
  };
}
