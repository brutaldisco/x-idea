"use client";

import { useEffect, useState } from "react";
import {
  getInstallPrompt,
  isStandaloneDisplay,
  PWA_INSTALL_DISMISS_KEY,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/pwa-install";

export function InstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandaloneDisplay()) {
      return;
    }
    if (window.localStorage.getItem(PWA_INSTALL_DISMISS_KEY) === "1") {
      return;
    }
    const sync = () => {
      setVisible(getInstallPrompt() !== null && !isStandaloneDisplay());
    };
    sync();
    return subscribeInstallPrompt(sync);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-[4.5rem] z-30 mx-auto max-w-3xl px-3 min-[48rem]:bottom-20">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3 shadow-[var(--shadow-card)]">
        <p className="text-sm">Chrome のアプリとして追加できます</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-full px-3 py-1 text-ink-2 text-xs hover:bg-paper-2"
            onClick={() => {
              window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, "1");
              setVisible(false);
            }}
          >
            あとで
          </button>
          <button
            type="button"
            className="rounded-full bg-ink px-3 py-1 text-paper text-xs"
            onClick={() => {
              void promptInstall();
              setVisible(false);
            }}
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
