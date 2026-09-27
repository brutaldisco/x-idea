import { shouldUseVideoTailSidecar } from "@/lib/video-download-plan";
import {
  resumeVideoOffset,
  resumeVideoTailOffset,
  tailRemainingBytes,
  tailSidecarNeedsFetch,
} from "@/lib/video-files";

export type VideoResumePhase =
  | "fresh"
  | "fetch-tail"
  | "merge-only"
  | "complete-only";

export function combinedLocalBytes(mainSize: number, partSize: number): number {
  return mainSize + partSize;
}

/** DB / IndexedDB とディスクのうち、大きい方を進捗の正本にする */
export function effectiveSavedProgress(
  savedProgress: number,
  mainSize: number,
  partSize: number,
): number {
  const disk = combinedLocalBytes(mainSize, partSize);
  const saved = savedProgress > 0 ? savedProgress : 0;
  return Math.max(saved, disk);
}

export function resolveResumeTotal(input: {
  trustedTotal: number | null;
  softTotal: number | null;
}): number {
  if (input.trustedTotal != null && input.trustedTotal > 0) {
    return input.trustedTotal;
  }
  if (input.softTotal != null && input.softTotal > 0) {
    return input.softTotal;
  }
  return 0;
}

/** mp4 の先頭 box が ftyp か（先頭 8 バイト以上） */
export function hasMp4FtypAtStart(bytes: Uint8Array): boolean {
  if (bytes.length < 8) {
    return false;
  }
  return (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

export function reconcileLocalVideoState(input: {
  mainSize: number;
  partSize: number;
  savedProgress: number;
  trustedTotal: number | null;
  softTotal: number | null;
  mainHasFtyp: boolean;
}): {
  mainOffset: number;
  tailOffset: number;
  received: number;
  total: number;
  phase: VideoResumePhase;
  remainingTail: number;
} {
  const total = resolveResumeTotal({
    trustedTotal: input.trustedTotal,
    softTotal: input.softTotal,
  });
  const saved = effectiveSavedProgress(
    input.savedProgress,
    input.mainSize,
    input.partSize,
  );
  const mainOffset = resumeVideoOffset(saved, input.mainSize);
  const remainingTail = tailRemainingBytes(total, mainOffset);
  const tailOffset =
    remainingTail > 0
      ? resumeVideoTailOffset(input.partSize, remainingTail)
      : input.partSize > 0
        ? Math.min(input.partSize, remainingTail || input.partSize)
        : 0;
  const received = mainOffset + tailOffset;

  if (
    total > 0 &&
    input.mainSize >= total &&
    input.partSize === 0 &&
    input.mainHasFtyp
  ) {
    return {
      mainOffset,
      tailOffset: 0,
      received: input.mainSize,
      total,
      phase: "complete-only",
      remainingTail: 0,
    };
  }

  const usesSidecar =
    shouldUseVideoTailSidecar(mainOffset) || input.partSize > 0;

  if (usesSidecar && total > 0 && input.mainHasFtyp) {
    if (!tailSidecarNeedsFetch(total, mainOffset, tailOffset)) {
      if (input.partSize > 0 && input.mainSize < total) {
        return {
          mainOffset,
          tailOffset,
          received,
          total,
          phase: "merge-only",
          remainingTail: 0,
        };
      }
      if (input.mainSize >= total) {
        return {
          mainOffset,
          tailOffset: 0,
          received: input.mainSize,
          total,
          phase: "complete-only",
          remainingTail: 0,
        };
      }
    }
    if (mainOffset > 0 || input.partSize > 0) {
      return {
        mainOffset,
        tailOffset,
        received,
        total,
        phase: "fetch-tail",
        remainingTail: Math.max(0, remainingTail - tailOffset),
      };
    }
  }

  if (mainOffset === 0 && input.partSize === 0) {
    return {
      mainOffset: 0,
      tailOffset: 0,
      received: 0,
      total,
      phase: "fresh",
      remainingTail: remainingTail,
    };
  }

  return {
    mainOffset,
    tailOffset,
    received,
    total,
    phase: "fetch-tail",
    remainingTail: Math.max(0, remainingTail - tailOffset),
  };
}
