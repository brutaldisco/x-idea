import { describe, expect, it } from "vitest";
import { fetchArticlePage } from "./article";

const LONG = `<!doctype html><html><head>
<title>Long</title><meta property="og:title" content="Long piece">
</head><body><article><h1>Long piece</h1>
<p>${"知識を余白に残す。".repeat(80)}</p>
</article></body></html>`;

const SHORT = `<!doctype html><html><head>
<title>Short</title><meta property="og:title" content="Short">
</head><body><article><h1>Short</h1><p>短い本文です。</p></article></body></html>`;

const OG_ONLY = `<!doctype html><html><head>
<title>Card</title>
<meta property="og:title" content="Card">
<meta property="og:description" content="概要だけ">
</head><body></body></html>`;

const NOARCHIVE = `<!doctype html><html><head>
<meta name="robots" content="noarchive">
<title>Secret</title></head><body><article><p>${"x".repeat(500)}</p></article></body></html>`;

const PAYWALL = `<!doctype html><html><head>
<title>Pay</title></head><body><p>Subscribe to continue reading this story.</p>
<article><p>${"x".repeat(500)}</p></article></body></html>`;

function respond(
  routes: Record<
    string,
    { status?: number; body?: string; type?: string; location?: string }
  >,
) {
  return async (input: string) => {
    const url = String(input);
    const exact = routes[url];
    const hit =
      exact ?? Object.entries(routes).find(([key]) => url.startsWith(key))?.[1];
    if (!hit) {
      return new Response("missing", { status: 404 });
    }
    if (hit.location) {
      return new Response(null, {
        status: 302,
        headers: { location: hit.location },
      });
    }
    return new Response(hit.body ?? "", {
      status: hit.status ?? 200,
      headers: { "content-type": hit.type ?? "text/html; charset=utf-8" },
    });
  };
}

describe("fetchArticlePage scopes (10 URLs)", () => {
  it("1 excluded domain → metadata_only", async () => {
    const result = await fetchArticlePage({
      url: "https://blocked.example/a",
      excludedDomains: ["blocked.example"],
      get: respond({}),
    });
    expect(result.scope).toBe("metadata_only");
    expect(result.error).toBe("excluded_domain");
  });

  it("2 robots deny → metadata_only", async () => {
    const result = await fetchArticlePage({
      url: "https://deny.example/a",
      get: respond({
        "https://deny.example/robots.txt": {
          body: "User-agent: *\nDisallow: /\n",
        },
      }),
    });
    expect(result.scope).toBe("metadata_only");
    expect(result.error).toBe("robots_disallow");
  });

  it("3 noarchive → metadata_only", async () => {
    const result = await fetchArticlePage({
      url: "https://news.example/noarchive",
      get: respond({
        "https://news.example/robots.txt": {
          body: "User-agent: *\nAllow: /\n",
        },
        "https://news.example/noarchive": { body: NOARCHIVE },
      }),
    });
    expect(result.scope).toBe("metadata_only");
  });

  it("4 paywall → metadata_only", async () => {
    const result = await fetchArticlePage({
      url: "https://news.example/paywall",
      get: respond({
        "https://news.example/robots.txt": {
          body: "User-agent: *\nAllow: /\n",
        },
        "https://news.example/paywall": { body: PAYWALL },
      }),
    });
    expect(result.scope).toBe("metadata_only");
  });

  it("5 short body → partial", async () => {
    const result = await fetchArticlePage({
      url: "https://news.example/short",
      get: respond({
        "https://news.example/robots.txt": {
          body: "User-agent: *\nAllow: /\n",
        },
        "https://news.example/short": { body: SHORT },
      }),
    });
    expect(result.scope).toBe("partial");
    expect(result.title).toBeTruthy();
  });

  it("6 long body → full", async () => {
    const result = await fetchArticlePage({
      url: "https://news.example/long",
      get: respond({
        "https://news.example/robots.txt": {
          body: "User-agent: *\nAllow: /\n",
        },
        "https://news.example/long": { body: LONG },
      }),
    });
    expect(result.scope).toBe("full");
    expect((result.contentText ?? "").length).toBeGreaterThanOrEqual(400);
  });

  it("7 404 → failed", async () => {
    const result = await fetchArticlePage({
      url: "https://news.example/missing",
      get: respond({
        "https://news.example/robots.txt": {
          body: "User-agent: *\nAllow: /\n",
        },
        "https://news.example/missing": { status: 404, body: "nope" },
      }),
    });
    expect(result.scope).toBe("failed");
    expect(result.httpStatus).toBe(404);
  });

  it("8 non-html → metadata_only", async () => {
    const result = await fetchArticlePage({
      url: "https://cdn.example/file.pdf",
      get: respond({
        "https://cdn.example/robots.txt": { body: "User-agent: *\nAllow: /\n" },
        "https://cdn.example/file.pdf": {
          type: "application/pdf",
          body: "%PDF",
        },
      }),
    });
    expect(result.scope).toBe("metadata_only");
    expect(result.error).toBe("not_html");
  });

  it("9 og-only → metadata_only", async () => {
    const result = await fetchArticlePage({
      url: "https://news.example/og",
      get: respond({
        "https://news.example/robots.txt": {
          body: "User-agent: *\nAllow: /\n",
        },
        "https://news.example/og": { body: OG_ONLY },
      }),
    });
    expect(result.scope).toBe("metadata_only");
    expect(result.title).toBeTruthy();
  });

  it("10 403 → metadata_only", async () => {
    const result = await fetchArticlePage({
      url: "https://news.example/forbidden",
      get: respond({
        "https://news.example/robots.txt": {
          body: "User-agent: *\nAllow: /\n",
        },
        "https://news.example/forbidden": { status: 403, body: "no" },
      }),
    });
    expect(result.scope).toBe("metadata_only");
    expect(result.httpStatus).toBe(403);
  });
});
