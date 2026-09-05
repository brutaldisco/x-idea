const X_HOSTS = new Set([
  "x.com",
  "twitter.com",
  "mobile.twitter.com",
  "t.co",
  "pic.twitter.com",
  "pbs.twimg.com",
  "video.twimg.com",
]);

const STATUS_PATH = /\/(?:[^/]+\/)?status(?:es)?\/\d+/i;
const ARTICLE_PATH = /\/i\/article\/|\/(?:[^/]+\/)?articles?\//i;

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

export function isXStatusUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    return (
      (host === "x.com" ||
        host === "twitter.com" ||
        host === "mobile.twitter.com") &&
      STATUS_PATH.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function isXArticleUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    return (
      (host === "x.com" ||
        host === "twitter.com" ||
        host === "mobile.twitter.com") &&
      ARTICLE_PATH.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function shouldFetchArticle(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (isXStatusUrl(url)) {
      return false;
    }
    if (isXArticleUrl(url)) {
      return true;
    }
    return !isXHost(url);
  } catch {
    return false;
  }
}

export function extractHttpUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"'）)】]+/gi) ?? [];
  const out: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?]+$/u, "");
    if (cleaned && !out.includes(cleaned)) {
      out.push(cleaned);
    }
  }
  return out.slice(0, 8);
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
