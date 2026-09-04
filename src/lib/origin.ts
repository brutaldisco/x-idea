const SAME_SITE = new Set(["same-origin", "same-site"]);

export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && SAME_SITE.has(site)) {
    return true;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return site === null;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
