import { formatBytes } from "@/lib/bytes";

export function videoDownloadPercent(
  received: number,
  total: number,
): number | null {
  if (!(total > 0) || !(received >= 0)) {
    return null;
  }
  return Math.min(100, Math.round((received / total) * 100));
}

export function videoDownloadBarPercent(
  received: number,
  total: number,
  estimatedBytes?: number | null,
): number | null {
  const known = videoDownloadPercent(received, total);
  if (known != null) {
    return known;
  }
  if (!(estimatedBytes && estimatedBytes > 0) || !(received >= 0)) {
    return null;
  }
  if (received === 0) {
    return 0;
  }
  return Math.min(99, Math.round((received / estimatedBytes) * 100));
}

export function videoDownloadByteLabel(
  received: number,
  total: number,
  estimatedBytes?: number | null,
): string | null {
  if (
    !(received > 0) &&
    !(total > 0) &&
    !(estimatedBytes && estimatedBytes > 0)
  ) {
    return null;
  }
  const left = formatBytes(Math.max(0, received));
  if (total > 0) {
    return `${left} / ${formatBytes(total)}`;
  }
  if (estimatedBytes && estimatedBytes > 0) {
    return `${left} / 約 ${formatBytes(estimatedBytes)}`;
  }
  return received > 0 ? left : null;
}

export function videoQueueStatusLabel(
  status: string,
  percent: number | null,
): string {
  if (status === "downloading") {
    return percent != null ? `ダウンロード中 ${percent}%` : "ダウンロード中";
  }
  if (status === "queued") {
    return "待機中";
  }
  if (status === "failed") {
    return "失敗";
  }
  if (status === "canceled") {
    return "取消";
  }
  if (status === "ready") {
    return "保存済";
  }
  return status;
}
