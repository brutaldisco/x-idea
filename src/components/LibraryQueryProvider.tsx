"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useState } from "react";
import {
  LIBRARY_STALE_MS,
  shouldPersistLibraryQuery,
} from "@/lib/library-cache";
import {
  createLibraryPersister,
  dropLegacyLibraryPersist,
  LIBRARY_PERSIST_BUSTER,
} from "@/lib/library-persist";

const persister = createLibraryPersister();

export function LibraryQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    dropLegacyLibraryPersist();
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: LIBRARY_STALE_MS,
          gcTime: 1000 * 60 * 60 * 24,
          refetchOnMount: false,
          refetchOnReconnect: false,
          refetchOnWindowFocus: false,
        },
      },
    });
  });

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        buster: LIBRARY_PERSIST_BUSTER,
        maxAge: 1000 * 60 * 60 * 24,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistLibraryQuery,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
