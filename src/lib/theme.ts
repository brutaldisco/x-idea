export const THEME_STORAGE_KEY = "x-idea-theme";
export const THEME_CHANGE_EVENT = "x-idea-theme-change";

export type ThemeMode = "light" | "dark";

export function isThemeMode(
  value: string | null | undefined,
): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function systemTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function readStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** 初回は OS 設定、以降は localStorage の light / dark */
export function resolveInitialTheme(): ThemeMode {
  return readStoredTheme() ?? systemTheme();
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // private mode など
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: mode }));
}

export function readTheme(): ThemeMode {
  if (typeof document === "undefined") {
    return "light";
  }
  const attr = document.documentElement.dataset.theme;
  return isThemeMode(attr) ? attr : resolveInitialTheme();
}

/** layout のインライン script 用（FOUC 防止） */
export const themeInitScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;
