import { totalBytesFromResponseHeaders } from "@/lib/remote-content-length";
import { fetchRemoteMedia } from "@/server/media/fetch-remote";

const PROBE_MS = 5_000;

async function cancelBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // ignore
  }
}

/**
 * サーバーから CDN の総バイトを読む。本文は取らない。
 * HEAD → Range 0-0 の順。失敗・タイムアウトは null。
 */
export async function probeRemoteByteLength(
  url: string,
): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_MS);
  try {
    try {
      const head = await fetchRemoteMedia(url, null, {
        method: "HEAD",
        signal: controller.signal,
      });
      const fromHead = totalBytesFromResponseHeaders(head.headers, head.status);
      await cancelBody(head);
      if (fromHead) {
        return fromHead;
      }
    } catch {
      if (controller.signal.aborted) {
        return null;
      }
    }
    const ranged = await fetchRemoteMedia(url, "bytes=0-0", {
      signal: controller.signal,
    });
    const total = totalBytesFromResponseHeaders(ranged.headers, ranged.status);
    await cancelBody(ranged);
    return total;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
