export const PWA_INSTALL_DISMISS_KEY = "x-idea-pwa-install-dismissed";

type Listener = () => void;

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function setInstallPrompt(event: BeforeInstallPromptEvent | null) {
  deferred = event;
  notify();
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    Boolean(window.navigator.standalone)
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) {
    return false;
  }
  await deferred.prompt();
  const choice = await deferred.userChoice;
  setInstallPrompt(null);
  return choice.outcome === "accepted";
}
