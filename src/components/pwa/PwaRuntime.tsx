"use client";

import { useEffect } from "react";
import { PWA_SW_PATH, PWA_TITLE_BAR_COLOR } from "@/lib/pwa";
import { isStandaloneDisplay, setInstallPrompt } from "@/lib/pwa-install";

function applyStandaloneTitleBar() {
  if (!isStandaloneDisplay()) {
    return;
  }
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", PWA_TITLE_BAR_COLOR);
    document.head.prepend(meta);
    return;
  }
  for (const meta of metas) {
    meta.setAttribute("content", PWA_TITLE_BAR_COLOR);
  }
}

export function PwaRuntime() {
  useEffect(() => {
    applyStandaloneTitleBar();
    if (!("serviceWorker" in navigator)) {
      return;
    }
    void navigator.serviceWorker
      .register(PWA_SW_PATH, { scope: "/" })
      .catch(() => undefined);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}
