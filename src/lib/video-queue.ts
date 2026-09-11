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
