import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import robotsParser from "robots-parser";
import sanitizeHtml from "sanitize-html";
import {
  type ArticleScope,
  classifyArticleScope,
  looksLikePaywall,
} from "@/server/fetch/classify";
import { hostOf, isExcludedDomain, normalizeUrl } from "@/server/ingest/url";

export const ARTICLE_UA = "MarginaliaBot/1.0 (+https://x-idea.vercel.app)";
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

export type ArticleFetchResult = {
  scope: ArticleScope;
  url: string;
  domain: string;
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  contentHtml: string | null;
  contentText: string | null;
  contentLinks: string[];
  httpStatus: number | null;
  error: string | null;
};

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const robotsCache = new Map<string, { at: number; body: string | null }>();

function attr(
  document: Document,
  selector: string,
  name: string,
): string | null {
  return document.querySelector(selector)?.getAttribute(name) ?? null;
}

function metaContent(document: Document, key: string): string | null {
  return (
    attr(document, `meta[property="${key}"]`, "content") ??
    attr(document, `meta[name="${key}"]`, "content")
  );
}

function robotsMetaBlocks(document: Document): boolean {
  const content = (
    metaContent(document, "robots") ??
    metaContent(document, "googlebot") ??
    ""
  ).toLowerCase();
  return content.includes("noarchive") || content.includes("none");
}

function jsonLdMeta(document: Document): {
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  description: string | null;
} {
  const out = {
    title: null as string | null,
    author: null as string | null,
    publishedAt: null as string | null,
    description: null as string | null,
  };
  for (const node of document.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const data = JSON.parse(node.textContent ?? "") as Record<
        string,
        unknown
      >;
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== "object") {
          continue;
        }
        const row = item as Record<string, unknown>;
        if (typeof row.headline === "string" && !out.title) {
          out.title = row.headline;
        }
        if (typeof row.datePublished === "string" && !out.publishedAt) {
          out.publishedAt = row.datePublished;
        }
        if (typeof row.description === "string" && !out.description) {
          out.description = row.description;
        }
        const author = row.author;
        if (!out.author && author && typeof author === "object") {
          const name = (author as { name?: unknown }).name;
          if (typeof name === "string") {
            out.author = name;
          }
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return out;
}

async function readLimited(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("body too large");
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

export async function followAndGet(
  url: string,
  get: Fetcher,
): Promise<{ res: Response; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await get(current, {
      redirect: "manual",
      cache: "no-store",
      headers: {
        "User-Agent": ARTICLE_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new Error("redirect without location");
      }
      current = new URL(loc, current).toString();
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error("too many redirects");
}

async function robotsAllows(url: string, get: Fetcher): Promise<boolean> {
  let robotsUrl: string;
  try {
    robotsUrl = new URL("/robots.txt", url).toString();
  } catch {
    return true;
  }
  const cached = robotsCache.get(robotsUrl);
  const now = Date.now();
  let body =
    cached && now - cached.at < 10 * 60 * 1000 ? cached.body : undefined;
  if (body === undefined) {
    try {
      const res = await get(robotsUrl, {
        cache: "no-store",
        headers: { "User-Agent": ARTICLE_UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      body = res.ok ? await res.text() : null;
    } catch {
      body = null;
    }
    robotsCache.set(robotsUrl, { at: now, body });
  }
  if (!body) {
    return true;
  }
  const robots = robotsParser(robotsUrl, body);
  return robots.isAllowed(url, ARTICLE_UA) !== false;
}

export async function fetchArticlePage(input: {
  url: string;
  excludedDomains?: readonly string[];
  get?: Fetcher;
}): Promise<ArticleFetchResult> {
  const get = input.get ?? fetch;
  const startUrl = normalizeUrl(input.url);
  const domain = hostOf(startUrl);
  const excluded = isExcludedDomain(startUrl, input.excludedDomains ?? []);

  const empty = (scope: ArticleScope, extra?: Partial<ArticleFetchResult>) => ({
    scope,
    url: startUrl,
    domain,
    title: extra?.title ?? null,
    author: extra?.author ?? null,
    publishedAt: extra?.publishedAt ?? null,
    description: extra?.description ?? null,
    thumbnailUrl: extra?.thumbnailUrl ?? null,
    contentHtml: extra?.contentHtml ?? null,
    contentText: extra?.contentText ?? null,
    contentLinks: extra?.contentLinks ?? [],
    httpStatus: extra?.httpStatus ?? null,
    error: extra?.error ?? null,
  });

  if (excluded) {
    return empty("metadata_only", { error: "excluded_domain" });
  }

  const allowed = await robotsAllows(startUrl, get);
  if (!allowed) {
    return empty("metadata_only", { error: "robots_disallow" });
  }

  let res: Response;
  let finalUrl = startUrl;
  try {
    const fetched = await followAndGet(startUrl, get);
    res = fetched.res;
    finalUrl = normalizeUrl(fetched.finalUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("too many redirects") ||
      message.includes("body too large")
    ) {
      return empty("failed", { error: message });
    }
    throw error;
  }

  if (res.status === 404 || res.status === 410 || res.status === 451) {
    return empty("failed", {
      httpStatus: res.status,
      error: `http_${res.status}`,
    });
  }
  if (res.status >= 500 || res.status === 429) {
    throw new Error(`http_${res.status}`);
  }
  if (!res.ok) {
    return empty("metadata_only", {
      httpStatus: res.status,
      error: `http_${res.status}`,
    });
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) {
    return empty("metadata_only", {
      httpStatus: res.status,
      error: "not_html",
    });
  }

  const html = await readLimited(res);
  const { document } = parseHTML(html);
  const doc = document as unknown as Document;
  const ld = jsonLdMeta(doc);
  const title =
    metaContent(doc, "og:title") ??
    ld.title ??
    doc.querySelector("title")?.textContent?.trim() ??
    null;
  const description =
    metaContent(doc, "og:description") ??
    metaContent(doc, "description") ??
    ld.description;
  const author = metaContent(doc, "author") ?? ld.author;
  const publishedAt =
    metaContent(doc, "article:published_time") ?? ld.publishedAt;
  const thumbnailUrl = metaContent(doc, "og:image");
  const blocked =
    robotsMetaBlocks(doc) ||
    looksLikePaywall(
      `${title ?? ""}\n${description ?? ""}\n${html.slice(0, 4000)}`,
    );

  let contentHtml: string | null = null;
  let contentText = "";
  try {
    const parsed = new Readability(doc).parse();
    if (parsed?.content) {
      contentHtml = sanitizeHtml(parsed.content, {
        allowedTags: sanitizeHtml.defaults.allowedTags.filter(
          (tag) => tag !== "script" && tag !== "style",
        ),
        allowedAttributes: {
          a: ["href", "title"],
          img: ["src", "alt"],
        },
      });
      contentText = (parsed.textContent ?? "").replace(/\s+\n/g, "\n").trim();
    }
  } catch {
    contentHtml = null;
    contentText = "";
  }

  if (blocked) {
    return {
      scope: "metadata_only",
      url: finalUrl,
      domain: hostOf(finalUrl),
      title,
      author,
      publishedAt,
      description,
      thumbnailUrl,
      contentHtml: null,
      contentText: null,
      contentLinks: [],
      httpStatus: res.status,
      error: "blocked",
    };
  }

  const links: string[] = [];
  if (contentHtml) {
    const { document: body } = parseHTML(contentHtml);
    for (const node of body.querySelectorAll("a[href]")) {
      const href = node.getAttribute("href");
      if (href?.startsWith("http") && !links.includes(href)) {
        links.push(href);
      }
      if (links.length >= 20) {
        break;
      }
    }
  }

  const scope = classifyArticleScope({
    blocked: false,
    textLength: contentText.length,
    hasMetadata: Boolean(title || description),
  });

  return {
    scope,
    url: finalUrl,
    domain: hostOf(finalUrl),
    title,
    author,
    publishedAt,
    description,
    thumbnailUrl,
    contentHtml: scope === "metadata_only" ? null : contentHtml,
    contentText:
      scope === "metadata_only" ? null : contentText.slice(0, 100_000),
    contentLinks: links,
    httpStatus: res.status,
    error: null,
  };
}
