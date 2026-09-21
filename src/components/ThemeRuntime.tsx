"use client";

import { useEffect } from "react";
import {
  PWA_BACKGROUND_COLOR,
  PWA_BACKGROUND_COLOR_DARK,
  PWA_TITLE_BAR_COLOR,
} from "@/lib/pwa";
import { isStandaloneDisplay } from "@/lib/pwa-install";
import {
  applyTheme,
  resolveInitialTheme,
  THEME_CHANGE_EVENT,
  type ThemeMode,
} from "@/lib/theme";

function themeColorFor(mode: ThemeMode): string {
  return mode === "dark" ? PWA_BACKGROUND_COLOR_DARK : PWA_BACKGROUND_COLOR;
}

function applyThemeColor(mode: ThemeMode) {
  const color = isStandaloneDisplay()
    ? PWA_TITLE_BAR_COLOR
    : themeColorFor(mode);
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    document.head.prepend(meta);
    return;
  }
  for (const meta of metas) {
    meta.setAttribute("content", color);
  }
}

export function ThemeRuntime() {
  useEffect(() => {
    applyTheme(resolveInitialTheme());

    const sync = (event: Event) => {
      const mode =
        (event as CustomEvent<ThemeMode>).detail ?? resolveInitialTheme();
      applyThemeColor(mode);
    };
    sync(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: resolveInitialTheme() }),
    );
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  return null;
}
