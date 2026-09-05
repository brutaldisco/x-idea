import { mkdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const DEFAULT_ROOT = "./data/media";

export function isLocalMediaEnabled(): boolean {
  if (process.env.VERCEL === "1") {
    return false;
  }
  if (process.env.MEDIA_ROOT === "") {
    return false;
  }
  return true;
}

export function mediaRoot(): string {
  const raw = process.env.MEDIA_ROOT?.trim();
  return resolve(raw && raw.length > 0 ? raw : DEFAULT_ROOT);
}

export function safeMediaSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

export function relativeMediaPath(input: {
  accountId: string;
  tweetId: string;
  mediaKey: string;
  ext: string;
}): string {
  const ext = input.ext.startsWith(".") ? input.ext : `.${input.ext}`;
  return [
    accountMediaRelativeDir(input.accountId),
    safeMediaSegment(input.tweetId),
    `${safeMediaSegment(input.mediaKey)}${ext}`,
  ].join("/");
}

export function accountMediaRelativeDir(accountId: string): string {
  return safeMediaSegment(accountId);
}

export function accountMediaDir(accountId: string): string {
  return resolveMediaPath(accountMediaRelativeDir(accountId));
}

export function mediaFolderHref(accountId?: string | null): string {
  if (!accountId) {
    return "/api/media/folder";
  }
  return `/api/media/folder?account=${encodeURIComponent(accountId)}`;
}

export function resolveMediaPath(relativePath: string): string {
  const root = mediaRoot();
  const resolved = resolve(root, relativePath);
  const rel = relative(root, resolved);
  if (
    rel.startsWith("..") ||
    isAbsolute(rel) ||
    rel.split(sep).includes("..")
  ) {
    throw new Error("invalid media path");
  }
  return resolved;
}

export async function ensureMediaDir(relativePath: string): Promise<string> {
  const abs = resolveMediaPath(relativePath);
  await mkdir(resolve(abs, ".."), { recursive: true });
  return abs;
}
