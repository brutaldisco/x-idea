"use client";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useState } from "react";

const persister =
  typeof window === "undefined"
    ? {
        persistClient: async () => undefined,
        restoreClient: async () => undefined,
        removeClient: async () => undefined,
      }
    : createSyncStoragePersister({
        storage: window.localStorage,
        key: "marginalia.library",
      });

export function LibraryQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            gcTime: 1000 * 60 * 60 * 24,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.queryKey[0] === "sources",
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
