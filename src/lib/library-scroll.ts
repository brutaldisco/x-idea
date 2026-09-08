const STORAGE_KEY = "marginalia.library.scroll";
const LOCK_MS = 4000;

export type LibraryVisit = {
  key: string;
  href: string;
  y: number;
  sourceId?: string;
  offset?: number;
  pageCount?: number;
};

const visitListeners = new Set<() => void>();
let restoreUntil = 0;
let leaveUntil = 0;
let pendingReturn = false;

function now(): number {
  return Date.now();
}

function emitLibraryVisit(): void {
  for (const listener of visitListeners) {
    listener();
  }
}

export function subscribeLibraryVisit(listener: () => void): () => void {
  visitListeners.add(listener);
  return () => {
    visitListeners.delete(listener);
  };
}

export function lockBrowserScrollRestoration(): void {
  if (typeof history === "undefined") {
    return;
  }
  try {
    history.scrollRestoration = "manual";
  } catch {
    return;
  }
}

export function beginLibraryRestore(): void {
  restoreUntil = now() + LOCK_MS;
}

export function beginLibraryLeave(): void {
  leaveUntil = now() + LOCK_MS;
}

export function resetLibraryScrollLocks(): void {
  restoreUntil = 0;
  leaveUntil = 0;
  pendingReturn = false;
}

export function markLibraryReturn(): void {
  pendingReturn = true;
}

export function peekLibraryReturn(): boolean {
  return pendingReturn;
}

export function consumeLibraryReturn(): boolean {
  const value = pendingReturn;
  pendingReturn = false;
  return value;
}

export function isLibraryScrollLocked(): boolean {
  const t = now();
  return t < restoreUntil || t < leaveUntil;
}

export function keepSavedScrollY(nextY: number, prevY: number): boolean {
  return nextY < 8 && prevY >= 8 && isLibraryScrollLocked();
}

export function libraryHref(search: string): string {
  return search ? `/library?${search}` : "/library";
}

export function isLibraryHref(href: string): boolean {
  return href === "/library" || href.startsWith("/library?");
}

export function libraryScrollKey(input: {
  sort: string;
  filters: string;
  view: string;
}): string {
  return `${input.sort}|${input.filters}|${input.view}`;
}

export function parseLibraryVisit(raw: string | null): LibraryVisit | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as {
      key?: unknown;
      href?: unknown;
      y?: unknown;
      sourceId?: unknown;
      offset?: unknown;
      pageCount?: unknown;
    };
    if (typeof parsed.key !== "string" || typeof parsed.y !== "number") {
      return null;
    }
    if (!Number.isFinite(parsed.y)) {
      return null;
    }
    const href =
      typeof parsed.href === "string" && isLibraryHref(parsed.href)
        ? parsed.href
        : "/library";
    const visit: LibraryVisit = {
      key: parsed.key,
      href,
      y: Math.max(0, parsed.y),
    };
    if (typeof parsed.sourceId === "string" && parsed.sourceId.length <= 48) {
      visit.sourceId = parsed.sourceId;
    }
    if (typeof parsed.offset === "number" && Number.isFinite(parsed.offset)) {
      visit.offset = parsed.offset;
    }
    if (
      typeof parsed.pageCount === "number" &&
      Number.isFinite(parsed.pageCount)
    ) {
      visit.pageCount = Math.max(1, Math.floor(parsed.pageCount));
    }
    return visit;
  } catch {
    return null;
  }
}

export function parseLibraryScroll(
  raw: string | null,
  key: string,
  href?: string,
): number | null {
  const visit = parseLibraryVisit(raw);
  if (!visit) {
    return null;
  }
  const keyOk = visit.key === key;
  const hrefOk = typeof href === "string" && visit.href === href;
  if (!keyOk && !hrefOk) {
    return null;
  }
  return visit.y;
}

export function parseLibraryHref(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { href?: unknown };
    if (typeof parsed.href !== "string" || !isLibraryHref(parsed.href)) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export function canRestoreLibraryScroll(
  y: number,
  scrollHeight: number,
  viewportHeight: number,
): boolean {
  return y <= Math.max(0, scrollHeight - viewportHeight) + 80;
}

function storageGet(): string | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readLibraryVisit(): LibraryVisit | null {
  return parseLibraryVisit(storageGet());
}

export function readLibraryHref(): string | null {
  return readLibraryVisit()?.href ?? null;
}

export function readLibraryScroll(key: string, href?: string): number | null {
  return parseLibraryScroll(storageGet(), key, href);
}

export function writeLibraryVisit(visit: LibraryVisit): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  lockBrowserScrollRestoration();
  const prev = readLibraryVisit();
  const y = keepSavedScrollY(visit.y, prev?.y ?? 0)
    ? (prev?.y ?? visit.y)
    : Math.max(0, visit.y);
  const next: LibraryVisit = {
    key: visit.key,
    href: isLibraryHref(visit.href) ? visit.href : (prev?.href ?? "/library"),
    y,
    sourceId: visit.sourceId ?? prev?.sourceId,
    offset: visit.offset ?? prev?.offset,
    pageCount: visit.pageCount ?? prev?.pageCount,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    emitLibraryVisit();
  } catch {
    return;
  }
}

export function writeLibraryScroll(
  key: string,
  y: number,
  href?: string,
  extra?: Pick<LibraryVisit, "sourceId" | "offset" | "pageCount">,
): void {
  writeLibraryVisit({
    key,
    y,
    href: href ?? readLibraryHref() ?? "/library",
    ...extra,
  });
}

export function sourceIdFromHref(href: string): string | null {
  const match = /\/source\/([^/?#]+)/.exec(href);
  return match?.[1] ?? null;
}

export function captureLibraryScroll(input: {
  key: string;
  href: string;
  sourceId?: string;
  pageCount?: number;
}): void {
  markLibraryReturn();
  beginLibraryLeave();
  let offset: number | undefined;
  if (input.sourceId) {
    const node = document.querySelector(`[data-source-id="${input.sourceId}"]`);
    if (node) {
      offset = Math.round(node.getBoundingClientRect().top);
    }
  }
  writeLibraryVisit({
    key: input.key,
    href: input.href,
    y: window.scrollY,
    sourceId: input.sourceId,
    offset,
    pageCount: input.pageCount,
  });
}

export function applyLibraryScroll(y: number): boolean {
  const maxY = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  );
  const target = Math.min(Math.max(0, y), maxY);
  window.scrollTo(0, target);
  return Math.abs(window.scrollY - target) <= 24;
}

export function applyLibraryVisit(visit: LibraryVisit): boolean {
  if (visit.sourceId && typeof visit.offset === "number") {
    const node = document.querySelector(`[data-source-id="${visit.sourceId}"]`);
    if (node) {
      const y = Math.max(
        0,
        node.getBoundingClientRect().top + window.scrollY - visit.offset,
      );
      return applyLibraryScroll(y);
    }
  }
  return applyLibraryScroll(visit.y);
}

export function canApplyLibraryVisit(
  visit: LibraryVisit,
  scrollHeight: number,
  viewportHeight: number,
): boolean {
  if (
    visit.sourceId &&
    typeof document !== "undefined" &&
    document.querySelector(`[data-source-id="${visit.sourceId}"]`)
  ) {
    return true;
  }
  return canRestoreLibraryScroll(visit.y, scrollHeight, viewportHeight);
}

export function getLibraryHrefSnapshot(): string {
  return readLibraryHref() ?? "/library";
}

export function getLibraryHrefServerSnapshot(): string {
  return "/library";
}
