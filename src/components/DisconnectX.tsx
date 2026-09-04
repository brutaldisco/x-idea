"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DisconnectX() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="mt-3 text-danger text-sm underline"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void fetch("/api/x/connection", { method: "DELETE" })
          .then((res) => {
            if (res.ok) {
              router.refresh();
            }
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      {busy ? "解除しています…" : "連携を解除"}
    </button>
  );
}
