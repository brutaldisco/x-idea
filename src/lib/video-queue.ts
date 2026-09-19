import { VIDEO_LEASE_STALE_MS } from "@/lib/video-download-plan";

export const VIDEO_MEDIA_TYPES = ["video", "animated_gif"] as const;

export type VideoEnqueueStatus =
  | "queued"
  | "ready"
  | "already_queued"
  | "full"
  | "invalid";

export type VideoEnqueueTally = {
  queued: number;
  skippedReady: number;
  skippedQueued: number;
  skippedFull: number;
  failed: number;
};

export function isVideoMediaType(type: string | null | undefined): boolean {
  return type === "video" || type === "animated_gif";
}

/**
 * ダウンロード実行の対象にできるか。
 * queued はそのまま。downloading は、このタブで実際に動いていない
 * （= 以前のセッションや通信途絶で取り残された）ものだけ再開対象にする。
 * failed は途中ファイルと進捗を残しているので、そのまま続きから再開できる
 * （ADR-023。キュー上限の更新はサーバー側で別途行う）。
 */
export function isResumableVideoQueueStatus(
  status: string,
  active: boolean,
): boolean {
  return (
    status === "queued" ||
    status === "failed" ||
    (status === "downloading" && !active)
  );
}

/** DB の UTC タイムスタンプ（"YYYY-MM-DD HH:MM:SS"）を epoch ms に直す */
export function parseDbUtcMs(text: string): number | null {
  const iso = text.includes("T") ? text : `${text.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * downloading のリースが切れているか（= 中断とみなせるか）（ADR-025）。
 * lastProgressAt が null（ハートビート導入前の行）なら中断扱い。
 * リースが生きている downloading は別タブで実行中なので触らない。
 */
export function isVideoLeaseStale(
  lastProgressAt: string | null,
  now = Date.now(),
): boolean {
  if (!lastProgressAt) {
    return true;
  }
  const at = parseDbUtcMs(lastProgressAt);
  if (at == null) {
    return true;
  }
  return now - at > VIDEO_LEASE_STALE_MS;
}

/**
 * ハートビートを送るか（ADR-025 改定）。受信バイトが前回送信時から
 * 増えたときだけ送る。固まったダウンロードがリースを持ち続けて
 * 「別のタブで実行中です」のまま再開不能になるのを防ぐ。
 * 初回（lastSentReceived < 0）はリース確立のため必ず送る。
 */
export function shouldSendVideoHeartbeat(
  lastSentReceived: number,
  received: number,
): boolean {
  return received !== lastSentReceived;
}

export function canShowSaveVideosMenu(input: {
  kind?: string | null;
  hasQueueableVideos?: boolean | null;
}): boolean {
  return input.kind === "x_post" && Boolean(input.hasQueueableVideos);
}

export function mediaHasQueueableVideos(
  media: Array<{ type: string; videoSaveStatus?: string | null }>,
): boolean {
  return media.some(
    (item) =>
      isVideoMediaType(item.type) &&
      item.videoSaveStatus !== "ready" &&
      item.videoSaveStatus !== "queued" &&
      item.videoSaveStatus !== "downloading",
  );
}

export function tallySourceVideoQueue(
  statuses: VideoEnqueueStatus[],
  unattempted = 0,
): VideoEnqueueTally {
  const tally: VideoEnqueueTally = {
    queued: 0,
    skippedReady: 0,
    skippedQueued: 0,
    skippedFull: 0,
    failed: 0,
  };
  for (const status of statuses) {
    if (status === "queued") {
      tally.queued += 1;
    } else if (status === "ready") {
      tally.skippedReady += 1;
    } else if (status === "already_queued") {
      tally.skippedQueued += 1;
    } else if (status === "full") {
      tally.skippedFull += 1;
    } else {
      tally.failed += 1;
    }
  }
  if (unattempted > 0) {
    tally.skippedFull += unattempted;
  }
  return tally;
}

export function sourceVideosQueueMessage(tally: VideoEnqueueTally): string {
  if (
    tally.queued > 0 &&
    tally.skippedReady === 0 &&
    tally.skippedQueued === 0 &&
    tally.skippedFull === 0 &&
    tally.failed === 0
  ) {
    return `${tally.queued}件をキューに追加しました。Videos タブで保存できます。`;
  }
  const parts: string[] = [];
  if (tally.queued > 0) {
    parts.push(`${tally.queued}件を追加`);
  }
  if (tally.skippedReady > 0) {
    parts.push(`${tally.skippedReady}件は保存済み`);
  }
  if (tally.skippedQueued > 0) {
    parts.push(`${tally.skippedQueued}件はすでにキュー`);
  }
  if (tally.skippedFull > 0) {
    parts.push(`${tally.skippedFull}件はキュー上限のため見送り`);
  }
  if (tally.failed > 0) {
    parts.push(`${tally.failed}件は追加できませんでした`);
  }
  if (parts.length === 0) {
    return "保存できる動画がありません。";
  }
  return `${parts.join("、")}。`;
}
