import { safeMediaSegment } from "@/lib/media-segment";

export const VIDEO_QUEUE_MAX = 15;

export function videoFileName(tweetId: string, mediaKey: string): string {
  return `${safeMediaSegment(tweetId)}_${safeMediaSegment(mediaKey)}.mp4`;
}

export function sanitizeFolderName(raw: string): string {
  const trimmed = raw.trim().slice(0, 120);
  const cleaned = [...trimmed]
    .filter((char) => char !== "/" && char !== "\\" && char.charCodeAt(0) >= 32)
    .join("")
    .replaceAll("..", "")
    .trim();
  if (!cleaned) {
    throw new Error("folder name empty");
  }
  return cleaned;
}

export function videoRelPath(input: {
  accountId: string;
  folderName?: string | null;
  tweetId: string;
  mediaKey: string;
}): string {
  const account = safeMediaSegment(input.accountId);
  const file = videoFileName(input.tweetId, input.mediaKey);
  if (input.folderName) {
    return `${account}/${sanitizeFolderName(input.folderName)}/${file}`;
  }
  return `${account}/${file}`;
}

export function isSafeVideoRelPath(path: string): boolean {
  if (path.length === 0 || path.length > 400) {
    return false;
  }
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    return false;
  }
  const parts = path.split("/");
  if (parts.length < 2 || parts.length > 3) {
    return false;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(parts[0] ?? "")) {
    return false;
  }
  const file = parts[parts.length - 1] ?? "";
  if (!file.endsWith(".mp4") || !/^[A-Za-z0-9._-]+\.mp4$/.test(file)) {
    return false;
  }
  if (parts.length === 3) {
    const folder = parts[1] ?? "";
    if (!folder || folder.includes("..") || /[\\/]/.test(folder)) {
      return false;
    }
  }
  return true;
}

export function parseVideoRelPath(path: string): {
  accountId: string;
  folderName: string | null;
  fileName: string;
} | null {
  if (!isSafeVideoRelPath(path)) {
    return null;
  }
  const parts = path.split("/");
  if (parts.length === 2) {
    return { accountId: parts[0], folderName: null, fileName: parts[1] };
  }
  return {
    accountId: parts[0],
    folderName: parts[1],
    fileName: parts[2],
  };
}
