export type UrlExpansion = {
  from: string;
  to: string;
};

export type UrlEntityLike = {
  url?: string;
  expanded_url?: string;
  unwound_url?: string;
};

const TCO_RE = /https?:\/\/(?:www\.)?t\.co\//i;

export function isTcoUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "t.co";
  } catch {
    return TCO_RE.test(url);
  }
}

export function containsTco(text: string | null | undefined): boolean {
  return Boolean(text && TCO_RE.test(text));
}

export function destinationUrl(item: UrlEntityLike): string | null {
  for (const raw of [item.unwound_url, item.expanded_url, item.url]) {
    const url = raw?.trim();
    if (url && !isTcoUrl(url)) {
      return url;
    }
  }
  return null;
}

function tcoAliases(url: string): string[] {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.replace(/^www\./, "") !== "t.co") {
      return [url];
    }
    const path = `${parsed.pathname}${parsed.search}`;
    return [
      `https://t.co${path}`,
      `http://t.co${path}`,
      `https://www.t.co${path}`,
      `http://www.t.co${path}`,
    ];
  } catch {
    return [url];
  }
}

export function expansionsFromUrlEntities(
  urls: readonly UrlEntityLike[] | undefined,
): UrlExpansion[] {
  const out: UrlExpansion[] = [];
  const seen = new Set<string>();
  for (const item of urls ?? []) {
    const from = item.url?.trim();
    const to = destinationUrl(item);
    if (!from || !to || from === to) {
      continue;
    }
    for (const alias of tcoAliases(from)) {
      if (seen.has(alias)) {
        continue;
      }
      seen.add(alias);
      out.push({ from: alias, to });
    }
  }
  return out;
}

function asUrlEntities(value: unknown): UrlEntityLike[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: UrlEntityLike[] = [];
  for (const item of value.slice(0, 32)) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url : undefined;
    const expanded =
      typeof row.expanded_url === "string" ? row.expanded_url : undefined;
    const unwound =
      typeof row.unwound_url === "string" ? row.unwound_url : undefined;
    if (url || expanded || unwound) {
      out.push({ url, expanded_url: expanded, unwound_url: unwound });
    }
  }
  return out;
}

export function parseEntitiesJson(raw: string | null | undefined): unknown {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function expansionsFromEntitiesJson(raw: unknown): UrlExpansion[] {
  const row = asRecord(raw);
  if (!row) {
    return [];
  }
  const nested = asRecord(row.entities);
  const note = asRecord(row.note_tweet);
  const noteEntities = asRecord(note?.entities);
  const article = asRecord(row.article);
  const articleEntities = asRecord(article?.entities);
  return [
    ...expansionsFromUrlEntities(asUrlEntities(row.urls)),
    ...expansionsFromUrlEntities(asUrlEntities(row.article_urls)),
    ...expansionsFromUrlEntities(asUrlEntities(nested?.urls)),
    ...expansionsFromUrlEntities(asUrlEntities(noteEntities?.urls)),
    ...expansionsFromUrlEntities(asUrlEntities(articleEntities?.urls)),
  ];
}

export function expandTcoInText(
  text: string,
  expansions: readonly UrlExpansion[],
): string {
  if (!text || expansions.length === 0 || !containsTco(text)) {
    return text;
  }
  let out = text;
  const sorted = [...expansions].sort((a, b) => b.from.length - a.from.length);
  for (const { from, to } of sorted) {
    if (!from || from === to || !out.includes(from)) {
      continue;
    }
    out = out.split(from).join(to);
  }
  return out;
}
