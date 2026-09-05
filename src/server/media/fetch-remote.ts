export const MEDIA_FETCH_HEADERS = {
  Accept: "*/*",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
} as const;

export async function fetchRemoteMedia(
  url: string,
  range?: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { ...MEDIA_FETCH_HEADERS };
  if (range) {
    headers.Range = range;
  }
  return fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers,
  });
}

function copyHeader(from: Headers, name: string): string | null {
  const value = from.get(name);
  return value && value.length > 0 ? value : null;
}

export async function proxyRemoteMedia(
  url: string,
  range?: string | null,
  fallbackType = "application/octet-stream",
): Promise<Response> {
  const remote = await fetchRemoteMedia(url, range);
  if (!remote.ok && remote.status !== 206) {
    return Response.json(
      {
        error: { code: "UPSTREAM", message: "メディアを取得できませんでした" },
      },
      { status: remote.status === 404 ? 404 : 502 },
    );
  }
  const headers = new Headers();
  headers.set(
    "Content-Type",
    copyHeader(remote.headers, "content-type") ?? fallbackType,
  );
  const length = copyHeader(remote.headers, "content-length");
  if (length) {
    headers.set("Content-Length", length);
  }
  const contentRange = copyHeader(remote.headers, "content-range");
  if (contentRange) {
    headers.set("Content-Range", contentRange);
  }
  headers.set(
    "Accept-Ranges",
    copyHeader(remote.headers, "accept-ranges") ?? "bytes",
  );
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(remote.body, {
    status: remote.status,
    headers,
  });
}
