"use client";

import { useEffect } from "react";

export function TickOnMount() {
  useEffect(() => {
    void fetch("/api/jobs/tick?source=client", { method: "POST" }).catch(
      () => undefined,
    );
  }, []);
  return null;
}
