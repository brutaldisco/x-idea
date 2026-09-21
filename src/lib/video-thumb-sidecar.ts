export const THUMB_SIDECAR_SUFFIX = ".lvl.json";

export type ThumbSidecarData = {
  version: 1;
  thumbSeekSeconds: number;
};

export function thumbSidecarName(videoFileName: string): string {
  return `${videoFileName}${THUMB_SIDECAR_SUFFIX}`;
}

export function isThumbSidecarFileName(name: string): boolean {
  return name.endsWith(THUMB_SIDECAR_SUFFIX);
}

export function parseThumbSidecar(text: string): number | undefined {
  try {
    const data = JSON.parse(text) as Partial<ThumbSidecarData>;
    const seconds = data.thumbSeekSeconds;
    if (
      typeof seconds === "number" &&
      Number.isFinite(seconds) &&
      seconds >= 0
    ) {
      return seconds;
    }
  } catch {
    // 壊れたサイドカーは無視する
  }
  return undefined;
}

export function serializeThumbSidecar(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error("Invalid thumbnail seek position");
  }
  const payload: ThumbSidecarData = {
    version: 1,
    thumbSeekSeconds: seconds,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}
