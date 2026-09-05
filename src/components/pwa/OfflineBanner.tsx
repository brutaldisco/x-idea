"use client";

import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (online) {
    return null;
  }

  return (
    <p className="notranslate fixed inset-x-0 top-0 z-40 bg-warn/90 px-4 py-2 text-center text-sm backdrop-blur">
      オフラインです。直近に開いたページは読めます。書き込みはできません。
    </p>
  );
}
