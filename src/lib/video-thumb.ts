const THUMB_WIDTH = 320;
const THUMB_JPEG_QUALITY = 0.72;

export function resolveThumbSeekSeconds(
  duration: number | undefined,
  customSeek: number,
): number {
  if (!Number.isFinite(customSeek) || customSeek < 0) {
    throw new Error("Invalid thumbnail seek position");
  }
  if (duration != null && Number.isFinite(duration) && duration > 0) {
    return Math.min(customSeek, Math.max(0, duration - 0.05));
  }
  return customSeek;
}

function waitForEvent(
  target: EventTarget,
  eventName: string,
  timeoutMs = 15000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`${eventName} failed`));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`${eventName} timed out`));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(eventName, onSuccess);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onSuccess, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

export function captureVideoFrameDataUrl(video: HTMLVideoElement): string {
  if (video.videoWidth < 1 || video.videoHeight < 1) {
    throw new Error("フレームを読めません");
  }
  const width = THUMB_WIDTH;
  const height = Math.max(
    1,
    Math.round((video.videoHeight / video.videoWidth) * width),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("フレームを読めません");
  }
  ctx.drawImage(video, 0, 0, width, height);
  try {
    return canvas.toDataURL("image/jpeg", THUMB_JPEG_QUALITY);
  } catch {
    throw new Error("この再生ではサムネイルを作れません");
  }
}

export async function captureFileFrameDataUrl(
  file: File,
  seekSeconds: number,
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;
  try {
    await waitForEvent(video, "loadedmetadata");
    const duration = Number.isFinite(video.duration) ? video.duration : undefined;
    video.currentTime = resolveThumbSeekSeconds(duration, seekSeconds);
    await waitForEvent(video, "seeked");
    return captureVideoFrameDataUrl(video);
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
