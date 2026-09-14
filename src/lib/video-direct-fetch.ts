import { totalBytesFromResponseHeaders } from "@/lib/remote-content-length";

/** アプリ origin の Referer を付けない。X CDN がホットリンク拒否することがある */
export const VIDEO_CDN_FETCH_INIT = {
  cache: "no-store",
  referrerPolicy: "no-referrer",
} as const;

async function cancelBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // ignore
  }
}

/**
 * ブラウザから CDN の総サイズを調べる。HEAD が CORS / 未対応でも
 * Range 0-0 で Content-Range が読めれば使う。どちらも失敗したら null。
 */
export async function probeDirectTotalBytes(
  url: string,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const head = await fetch(url, {
      ...VIDEO_CDN_FETCH_INIT,
      method: "HEAD",
      signal,
    });
    const fromHead = totalBytesFromResponseHeaders(head.headers, head.status);
    if (fromHead) {
      await cancelBody(head);
      return fromHead;
    }
    await cancelBody(head);
  } catch {
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException("Aborted", "AbortError");
    }
  }
  try {
    const probe = await fetch(url, {
      ...VIDEO_CDN_FETCH_INIT,
      headers: { Range: "bytes=0-0" },
      signal,
    });
    const total = totalBytesFromResponseHeaders(probe.headers, probe.status);
    await cancelBody(probe);
    return total;
  } catch {
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException("Aborted", "AbortError");
    }
    return null;
  }
}
