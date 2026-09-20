const KB = 1024;
const MB = 1024 * KB;

export const VIDEO_CHUNK_MIN = 1 * MB;
export const VIDEO_CHUNK_MAX = 32 * MB;
/** この時間だけ 1 バイトも受信できなければ接続が止まったとみなす */
export const VIDEO_STALL_MS = 30_000;

/**
 * CDN 直接ダウンロードの同時接続数。
 * video.twimg.com はコネクション単位でスロットルする（実測: 1 接続 ~120KB/s、
 * 4 並列で合計 ~4.6MB/s、8 並列では逆に低下）ため 4 が最適（ADR-021）。
 */
export const DIRECT_PARALLEL = 4;
export const DIRECT_CHUNK_MAX = 8 * MB;

/**
 * 動画どうしの同時ダウンロード数。1 本の内部で DIRECT_PARALLEL 本の
 * 接続を使うため、ファイル間は 2 本までに抑えて帯域を分け合う。
 * 1 本が失敗・中断しても残りは止まらない（ADR-023）。
 */
export const VIDEO_FILE_PARALLEL = 2;

/** ダウンロード中の生存確認（ハートビート）をサーバーへ送る間隔（ADR-025） */
export const VIDEO_HEARTBEAT_MS = 8_000;

/**
 * File System Access の write/seek/close/getFile のタイムアウト。
 * 固まった呼び出しを失敗として落とし、failed → 再開の流れに乗せる。
 * リース（90 秒）より短くして、リースが切れる前に自分で片付ける。
 */
export const VIDEO_WRITE_TIMEOUT_MS = 60_000;

/**
 * createWritable のタイムアウト。レジューム時の keepExistingData は
 * 既存内容の全コピーが走ることがある（ADR-026）ため長めに取る。
 * 大きな途中ファイルは `videoOpenTimeoutMs` でさらに延ばす。
 */
export const VIDEO_OPEN_TIMEOUT_MS = 180_000;
export const VIDEO_OPEN_TIMEOUT_MAX_MS = 15 * 60_000;
const VIDEO_OPEN_TIMEOUT_PER_GB_MS = 90_000;

/**
 * keepExistingData の開き直しは既存バイトの全コピーが走る。
 * 4GB 超だと 180 秒では足りず、タイムアウト→再オープンのループになる。
 */
export function videoOpenTimeoutMs(existingBytes = 0): number {
  if (!(existingBytes > 0)) {
    return VIDEO_OPEN_TIMEOUT_MS;
  }
  const gigs = Math.ceil(existingBytes / (1024 * 1024 * 1024));
  return Math.min(
    VIDEO_OPEN_TIMEOUT_MAX_MS,
    Math.max(
      VIDEO_OPEN_TIMEOUT_MS,
      VIDEO_OPEN_TIMEOUT_MS + gigs * VIDEO_OPEN_TIMEOUT_PER_GB_MS,
    ),
  );
}

/**
 * CDN 並列ダウンロードで書き込み位置から先読みしてよい上限（背圧）。
 * 1 レーンの停滞で未書き込みチャンクがメモリに溜まり続けるのを防ぐ。
 */
export const VIDEO_DIRECT_LOOKAHEAD_BYTES = 32 * MB;

/** この時間バイトが増えなければ UI に「応答なし。再接続しています」を出す */
export const VIDEO_STALL_NOTICE_MS = 30_000;

/**
 * CDN URL 解決（/api/media/[id]/url）とブラウザ側サイズ探知のタイムアウト。
 * 最初の 1 バイトが来るまでウォッチドッグはまだ動かないため、
 * ここで固まると何も起きなくなるのを防ぐ。
 */
export const VIDEO_URL_RESOLVE_MS = 30_000;

/**
 * この時間バイトが増えなければその本だけ切断して保存済み位置から取り直す。
 * リース（90 秒）が切れる前に自分で回復する。
 */
export const VIDEO_STALL_WATCHDOG_MS = 75_000;

/** ウォッチドッグによる自動取り直しの上限。超えたら failed にする */
export const VIDEO_STALL_MAX_RESTARTS = 3;

/**
 * downloading のリース有効時間（ADR-025）。この間ハートビートが途絶えたら
 * 中断（前のセッションの取り残し）とみなし、別タブ・別セッションからの
 * 再開を許可する。バックグラウンドタブのタイマー絞り込み（約 1 分に
 * 1 回まで）を吸収できるよう 90 秒と長めに取る。
 */
export const VIDEO_LEASE_STALE_MS = 90_000;

/**
 * 直接ダウンロードのチャンクサイズ。小さいファイルでも全ワーカーに仕事が
 * 行くよう total / DIRECT_PARALLEL を目安にし、1〜8MB に収める。
 */
export function directChunkBytes(total: number): number {
  if (!(total > 0)) {
    return DIRECT_CHUNK_MAX;
  }
  const quarter = Math.ceil(total / DIRECT_PARALLEL);
  return clamp(quarter, VIDEO_CHUNK_MIN, DIRECT_CHUNK_MAX);
}

export type VideoDownloadPlan = {
  chunkBytes: number;
  parallel: number;
  retries: number;
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function connectionDownlinkKbps(): number | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  const connection = (
    navigator as Navigator & {
      connection?: { downlink?: number; effectiveType?: string };
    }
  ).connection;
  if (!connection) {
    return null;
  }
  if (typeof connection.downlink === "number" && connection.downlink > 0) {
    return (connection.downlink * 1000) / 8;
  }
  switch (connection.effectiveType) {
    case "slow-2g":
      return 30 * KB;
    case "2g":
      return 60 * KB;
    case "3g":
      return 400 * KB;
    case "4g":
      return 2 * MB;
    default:
      return null;
  }
}

function planForSpeed(bytesPerSecond: number): VideoDownloadPlan {
  if (bytesPerSecond < 500 * KB) {
    return { chunkBytes: 2 * MB, parallel: 1, retries: 5 };
  }
  if (bytesPerSecond < 2 * MB) {
    return { chunkBytes: 4 * MB, parallel: 1, retries: 4 };
  }
  if (bytesPerSecond < 8 * MB) {
    return { chunkBytes: 8 * MB, parallel: 2, retries: 3 };
  }
  if (bytesPerSecond < 25 * MB) {
    return { chunkBytes: 16 * MB, parallel: 3, retries: 3 };
  }
  return { chunkBytes: VIDEO_CHUNK_MAX, parallel: 4, retries: 2 };
}

export function initialVideoDownloadPlan(
  estimatedBytes?: number | null,
): VideoDownloadPlan {
  const hinted = connectionDownlinkKbps();
  if (hinted != null) {
    return planForSpeed(hinted);
  }
  if (estimatedBytes != null && estimatedBytes > 200 * MB) {
    return { chunkBytes: 4 * MB, parallel: 1, retries: 4 };
  }
  return { chunkBytes: 8 * MB, parallel: 1, retries: 3 };
}

export function tuneVideoDownloadPlan(
  plan: VideoDownloadPlan,
  bytesPerSecond: number,
): VideoDownloadPlan {
  if (!(bytesPerSecond > 0)) {
    return plan;
  }
  const target = planForSpeed(bytesPerSecond);
  const min = Math.max(VIDEO_CHUNK_MIN, Math.floor(plan.chunkBytes / 2));
  const max = Math.min(VIDEO_CHUNK_MAX, plan.chunkBytes * 2);
  return {
    chunkBytes: clamp(target.chunkBytes, min, Math.max(min, max)),
    parallel: clamp(target.parallel, 1, Math.max(1, plan.parallel + 1)),
    retries: plan.retries,
  };
}
