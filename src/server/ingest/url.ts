const X_HOSTS = new Set([
  "x.com",
  "twitter.com",
  "mobile.twitter.com",
  "t.co",
  "pic.twitter.com",
  "pbs.twimg.com",
]);

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function isXHost(url: string): boolean {
  return X_HOSTS.has(hostOf(url));
}

export function shouldFetchArticle(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return !isXHost(url);
  } catch {
    return false;
  }
}

export function isExcludedDomain(
  url: string,
  excluded: readonly string[],
): boolean {
  const host = hostOf(url);
  return excluded.some((item) => {
    const domain = item.replace(/^www\./, "").toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  });
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) {
        parsed.searchParams.delete(key);
      }
    }
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
