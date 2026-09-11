const STORAGE_KEY = "x-idea.library.account";
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLibraryAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readLibraryAccountId(): string {
  if (typeof sessionStorage === "undefined") {
    return "";
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeLibraryAccountId(id: string | null | undefined): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  const next = id ?? "";
  try {
    const prev = sessionStorage.getItem(STORAGE_KEY) ?? "";
    if (prev === next) {
      return;
    }
    if (!next) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, next);
    }
    emit();
  } catch {
    return;
  }
}

export function getLibraryAccountSnapshot(): string {
  return readLibraryAccountId();
}

export function getLibraryAccountServerSnapshot(): string {
  return "";
}
