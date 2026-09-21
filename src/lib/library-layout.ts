import type { LibraryView } from "@/lib/source-filters";

export const LIBRARY_WIDE_STORAGE_KEY = "x-idea-library-wide";
export const LIBRARY_WIDE_CHANGE_EVENT = "x-idea-library-wide-change";

export const WIDE_MEDIA_GRID_CLASS = "wide-media-grid";
export const WIDE_GRID_PAGE_CLASS = "wide-grid-page";
export const APP_SHELL_WIDE_GRID_CLASS = "app-shell-wide-grid";

/** Library 3 列（max-w-3xl + px-4 + gap-2）と同じカード幅 */
export const WIDE_GRID_CARD_REM = 15;
export const WIDE_GRID_GAP_REM = 0.5;
export const WIDE_GRID_PAGE_PAD_REM = 1.25;
export const WIDE_GRID_BREAK_4COL_REM = 64;
export const WIDE_GRID_BREAK_5COL_REM = 79.5;

const listeners = new Set<() => void>();
const gridWideListeners = new Set<() => void>();
let libraryGridWideActive = false;

function emitLibraryWideChange() {
  for (const listener of listeners) {
    listener();
  }
}

function emitLibraryGridWideChange() {
  for (const listener of gridWideListeners) {
    listener();
  }
}

export function subscribeLibraryWide(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function subscribeLibraryGridWide(onStoreChange: () => void): () => void {
  gridWideListeners.add(onStoreChange);
  return () => gridWideListeners.delete(onStoreChange);
}

export function readLibraryWide(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return localStorage.getItem(LIBRARY_WIDE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function readLibraryGridWide(): boolean {
  return libraryGridWideActive;
}

export function getLibraryWideServerSnapshot(): boolean {
  return false;
}

export function getLibraryGridWideServerSnapshot(): boolean {
  return false;
}

export function setLibraryGridWide(active: boolean): void {
  if (libraryGridWideActive === active) {
    return;
  }
  libraryGridWideActive = active;
  emitLibraryGridWideChange();
}

export function applyLibraryWide(enabled: boolean): void {
  if (typeof document !== "undefined") {
    if (enabled) {
      document.documentElement.dataset.libraryWide = "true";
    } else {
      delete document.documentElement.dataset.libraryWide;
      setLibraryGridWide(false);
    }
  }
  try {
    localStorage.setItem(LIBRARY_WIDE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // private mode など
  }
  emitLibraryWideChange();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(LIBRARY_WIDE_CHANGE_EVENT, { detail: enabled }),
    );
  }
}

export function wideGridShellActive(input: {
  wideEnabled: boolean;
  onLibraryGrid: boolean;
  onVideos: boolean;
}): boolean {
  return (
    input.wideEnabled && (input.onVideos || input.onLibraryGrid)
  );
}

export function libraryGridClass(view: LibraryView, wide: boolean): string {
  if (view !== "grid") {
    return "mt-4 grid min-w-0 grid-cols-1 gap-3 text-wrap";
  }
  if (wide) {
    return `mt-4 ${WIDE_MEDIA_GRID_CLASS} min-w-0 text-wrap`;
  }
  return "mt-4 grid min-w-0 grid-cols-2 gap-2 text-wrap min-[48rem]:grid-cols-3";
}

export function videosGridClass(wide: boolean): string {
  if (wide) {
    return `mt-4 ${WIDE_MEDIA_GRID_CLASS} min-w-0`;
  }
  return "mt-4 grid grid-cols-2 gap-3 min-[48rem]:grid-cols-3";
}

export function libraryShellMaxWidthClass(input: {
  readerOpen: boolean;
  wideProp: boolean;
  wideGridActive: boolean;
}): string {
  if (input.readerOpen || input.wideProp) {
    return "max-w-4xl pb-36 min-[48rem]:pb-32";
  }
  if (input.wideGridActive) {
    return `${APP_SHELL_WIDE_GRID_CLASS} w-full pb-36 min-[48rem]:pb-32`;
  }
  return "max-w-3xl pb-32 min-[48rem]:pb-24";
}

/** layout のインライン script 用（幅のちらつき軽減） */
export const libraryWideInitScript = `(function(){try{var k=${JSON.stringify(LIBRARY_WIDE_STORAGE_KEY)};if(localStorage.getItem(k)==="1"){document.documentElement.dataset.libraryWide="true";}}catch(e){}})();`;
