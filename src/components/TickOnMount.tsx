"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { refreshLibraryAfterWrite } from "@/lib/library-cache";

export function TickOnMount() {
  const queryClient = useQueryClient();
  useEffect(() => {
    void fetch("/api/jobs/tick?source=client", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          return;
        }
        const body = (await res.json().catch(() => null)) as {
          ran?: number;
        } | null;
        if (typeof body?.ran === "number" && body.ran > 0) {
          await refreshLibraryAfterWrite(queryClient);
        }
      })
      .catch(() => undefined);
  }, [queryClient]);
  return null;
}
