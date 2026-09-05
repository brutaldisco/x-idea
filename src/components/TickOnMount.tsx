"use client";

import { useEffect } from "react";
import { syncPendingMediaToLocal } from "@/lib/media-companion";

export function TickOnMount() {
  useEffect(() => {
    void fetch("/api/jobs/tick?source=client", { method: "POST" }).catch(
      () => undefined,
    );
    void syncPendingMediaToLocal().catch(() => undefined);
  }, []);
  return null;
}
