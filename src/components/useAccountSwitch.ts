"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { writeLibraryAccountId } from "@/lib/library-account";
import { resetLibraryQueries } from "@/lib/library-cache";
import { clearSourcesHttpCache } from "@/lib/pwa";

export function useAccountSwitch() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function switchTo(accountId: string): Promise<boolean> {
    if (!accountId || busy) {
      return false;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/x/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctx: accountId }),
      });
      if (!res.ok) {
        return false;
      }
      writeLibraryAccountId(accountId);
      resetLibraryQueries(queryClient);
      void clearSourcesHttpCache();
      startTransition(() => router.refresh());
      return true;
    } finally {
      setBusy(false);
    }
  }

  return { busy, switchTo };
}
