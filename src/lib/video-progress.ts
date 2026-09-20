import { formatBytes } from "@/lib/bytes";

/** 速度計算に使う直近ウィンドウ */
export const VIDEO_SPEED_WINDOW_MS = 4_000;
/** 速度を出すまでの最短観測時間（立ち上がりの暴れを抑える） */
export const VIDEO_SPEED_MIN_MS = 400;
/**
 * これ以上の一括増加はレジューム位置の同期とみなし、速度サンプルをリセットする。
 * 4 並列 × 8MB が一気に揃っても超えない余裕を取る。
 */
export const VIDEO_SPEED_JUMP_BYTES = 64 * 1024 * 1024;

export type VideoSpeedSample = { at: number; received: number };

function pruneSpeedSamples(
  samples: VideoSpeedSample[],
  now: number,
): VideoSpeedSample[] {
  const cutoff = now - VIDEO_SPEED_WINDOW_MS;
  const kept = samples.filter((sample) => sample.at >= cutoff);
  // ウィンドウを外れても直近の 1 件は残す。消すと速度が 0 に落ちず
  // 次の転送まで「計測中」のままになる
  return kept.length > 0 ? kept : samples.slice(-1);
}

/**
 * 受信量の時系列を直近ウィンドウに足す。巻き戻しやレジューム同期の
 * 大きな跳びはサンプルを捨ててやり直す。
 */
export function appendVideoSpeedSample(
  samples: VideoSpeedSample[],
  received: number,
  now = Date.now(),
): VideoSpeedSample[] {
  const last = samples[samples.length - 1];
  if (last && received < last.received) {
    return [{ at: now, received }];
  }
  if (last && received - last.received > VIDEO_SPEED_JUMP_BYTES) {
    return [{ at: now, received }];
  }
  if (last && received === last.received) {
    // 同じ受信量の繰り返し（レジューム位置の表示など）は速度サンプルにしない。
    // ここで時刻を進めると、実際の転送が始まるまでの時間が分母に入り、
    // 残り取得が走っていても 0 B/s 表示になる
    return samples;
  }
  return pruneSpeedSamples([...samples, { at: now, received }], now);
}

/** 直近ウィンドウの平均バイト/秒。観測が足りなければ null */
export function videoDownloadBytesPerSec(
  samples: VideoSpeedSample[],
  now = Date.now(),
): number | null {
  if (samples.length < 2) {
    return null;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  // 最後にバイトが増えてからウィンドウを超えたら止まったとみなす。
  // 古い時刻を分母に残すと 0 に落ちない
  if (now - last.at >= VIDEO_SPEED_WINDOW_MS) {
    return 0;
  }
  const elapsedMs = Math.max(last.at, now) - first.at;
  if (elapsedMs < VIDEO_SPEED_MIN_MS) {
    return null;
  }
  const gained = last.received - first.received;
  if (gained < 0) {
    return null;
  }
  if (gained === 0) {
    // 転送が止まった（サンプルが同じ値のまま）ときは 0 B/s に落とす
    return 0;
  }
  return gained / (elapsedMs / 1000);
}

/** `12.3 MB/s`。観測前は null（呼び出し側で「計測中」などにする） */
export function formatDownloadSpeed(bytesPerSec: number | null): string | null {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec) || bytesPerSec < 0) {
    return null;
  }
  return `${formatBytes(bytesPerSec)}/s`;
}

export function nextVideoDownloadSpeed(
  samples: VideoSpeedSample[],
  received: number,
  now = Date.now(),
): { samples: VideoSpeedSample[]; bps: number | null } {
  const next = appendVideoSpeedSample(samples, received, now);
  return { samples: next, bps: videoDownloadBytesPerSec(next, now) };
}

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
