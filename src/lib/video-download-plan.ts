const KB = 1024;
const MB = 1024 * KB;

export const VIDEO_CHUNK_MIN = 1 * MB;
export const VIDEO_CHUNK_MAX = 32 * MB;

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
