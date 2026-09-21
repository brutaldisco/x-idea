"use client";

import { useEffect, useSyncExternalStore } from "react";
import { parseVideoRelPath } from "@/lib/video-path";
import {
  ensureWritePermission,
  getVideoFile,
  hasWritePermission,
  loadVideoRoot,
  readVideoThumbSeekSeconds,
  writeVideoThumbSeekSeconds,
} from "@/lib/video-store";
import { captureFileFrameDataUrl } from "@/lib/video-thumb";

const thumbs = new Map<string, string>();
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();
let active = 0;
const queue: Array<() => void> = [];

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeVideoThumbs(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function readVideoThumbUrl(
  relPath: string | null | undefined,
): string | null {
  if (!relPath) {
    return null;
  }
  return thumbs.get(relPath) ?? null;
}

export function getVideoThumbServerSnapshot(): null {
  return null;
}

export function publishVideoThumb(relPath: string, dataUrl: string): void {
  thumbs.set(relPath, dataUrl);
  emit();
}

export function forgetVideoThumb(relPath: string | null | undefined): void {
  if (!relPath || !thumbs.delete(relPath)) {
    return;
  }
  emit();
}

export function moveVideoThumbCache(fromPath: string, toPath: string): void {
  const url = thumbs.get(fromPath);
  if (!url || fromPath === toPath) {
    return;
  }
  thumbs.delete(fromPath);
  thumbs.set(toPath, url);
  emit();
}

function enqueue(task: () => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const run = () => {
      active += 1;
      void task().finally(() => {
        active -= 1;
        resolve();
        const next = queue.shift();
        if (next) {
          next();
        }
      });
    };
    if (active < 2) {
      run();
      return;
    }
    queue.push(run);
  });
}

export async function savePlaybackThumbnail(input: {
  relPath: string;
  seconds: number;
  dataUrl: string;
}): Promise<void> {
  const accountId = parseVideoRelPath(input.relPath)?.accountId ?? null;
  const root = await loadVideoRoot(accountId);
  if (!root || !(await ensureWritePermission(root))) {
    throw new Error("保存フォルダをリンクしてください");
  }
  await writeVideoThumbSeekSeconds(root, input.relPath, input.seconds);
  publishVideoThumb(input.relPath, input.dataUrl);
}

export function hydrateVideoThumb(relPath: string | null | undefined): void {
  if (!relPath || thumbs.has(relPath) || inflight.has(relPath)) {
    return;
  }
  const accountId = parseVideoRelPath(relPath)?.accountId ?? null;
  if (!accountId) {
    return;
  }
  const job = enqueue(async () => {
    const root = await loadVideoRoot(accountId);
    if (!root || !(await hasWritePermission(root))) {
      return;
    }
    const seconds = await readVideoThumbSeekSeconds(root, relPath);
    if (seconds == null) {
      return;
    }
    const file = await getVideoFile(root, relPath);
    const dataUrl = await captureFileFrameDataUrl(file, seconds);
    publishVideoThumb(relPath, dataUrl);
  }).finally(() => {
    inflight.delete(relPath);
  });
  inflight.set(relPath, job);
}

/** 保存済み動画だけ。写真サムネは置き換えない。 */
export function useSavedVideoThumb(
  relPath: string | null | undefined,
): string | null {
  const url = useSyncExternalStore(
    subscribeVideoThumbs,
    () => readVideoThumbUrl(relPath),
    getVideoThumbServerSnapshot,
  );
  useEffect(() => {
    hydrateVideoThumb(relPath);
  }, [relPath]);
  return url;
}
