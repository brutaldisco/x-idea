export function videoDownloadPercent(
  received: number,
  total: number,
): number | null {
  if (!(total > 0) || !(received >= 0)) {
    return null;
  }
  return Math.min(100, Math.round((received / total) * 100));
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
