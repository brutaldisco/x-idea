"use client";

import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ReactNode, useState } from "react";
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
          staleTime: 15_000,
          gcTime: 1000 * 60 * 60 * 24,
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
          shouldDehydrateQuery: (query) =>
            query.queryKey[0] === "sources" &&
            defaultShouldDehydrateQuery(query),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
