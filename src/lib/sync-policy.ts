export const MIN_SYNC_INTERVAL_MIN = 360;
export const INCREMENTAL_BOOKMARK_PAGE = 10;
export const INITIAL_BOOKMARK_PAGE = 100;
export const AUTO_SYNC_CRON = "0 */6 * * *";

export function clampSyncIntervalMin(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_SYNC_INTERVAL_MIN;
  }
  return Math.max(MIN_SYNC_INTERVAL_MIN, Math.round(value));
}

export function bookmarkPageSize(incremental: boolean): number {
  return incremental ? INCREMENTAL_BOOKMARK_PAGE : INITIAL_BOOKMARK_PAGE;
}

export function isAutoSyncDue(
  lastSyncedAt: string | null | undefined,
  intervalMin: number,
  now = Date.now(),
): boolean {
  const intervalMs = clampSyncIntervalMin(intervalMin) * 60_000;
  if (!lastSyncedAt) {
    return true;
  }
  const at = Date.parse(lastSyncedAt);
  if (!Number.isFinite(at)) {
    return true;
  }
  return now - at >= intervalMs;
}
