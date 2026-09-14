/**
 * リモート応答からファイル総バイトを読む。
 * 206 の Content-Length はレンジ長なので使わず、Content-Range の分母か
 * 200/HEAD の Content-Length だけを総量とみなす。
 */
export function totalBytesFromResponseHeaders(
  headers: { get(name: string): string | null },
  status: number,
): number | null {
  const range = headers.get("content-range");
  const match = range?.match(/\/(\d+)\s*$/);
  if (match) {
    const total = Number(match[1]);
    return Number.isFinite(total) && total > 0 ? total : null;
  }
  if (status === 200) {
    const length = Number(headers.get("content-length") ?? 0);
    return Number.isFinite(length) && length > 0 ? length : null;
  }
  return null;
}
