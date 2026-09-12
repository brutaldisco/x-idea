import { isSafeVideoRelPath, videoRelPath } from "@/lib/video-path";

export function resolveSavedVideoRelPath(input: {
  relPath?: string | null;
  accountId?: string | null;
  folderName?: string | null;
  tweetId?: string | null;
  mediaKey?: string | null;
}): string | null {
  if (input.relPath && isSafeVideoRelPath(input.relPath)) {
    return input.relPath;
  }
  if (input.accountId && input.tweetId && input.mediaKey) {
    try {
      return videoRelPath({
        accountId: input.accountId,
        folderName: input.folderName,
        tweetId: input.tweetId,
        mediaKey: input.mediaKey,
      });
    } catch {
      return null;
    }
  }
  return null;
}

export function collectSavedVideoRelPaths(
  rows: Array<{
    relPath?: string | null;
    accountId?: string | null;
    folderName?: string | null;
    tweetId?: string | null;
    mediaKey?: string | null;
  }>,
): { accountId: string | null; videoRelPaths: string[] } {
  const paths = new Set<string>();
  let accountId: string | null = null;
  for (const row of rows) {
    if (row.accountId) {
      accountId = row.accountId;
    }
    const path = resolveSavedVideoRelPath(row);
    if (path) {
      paths.add(path);
    }
  }
  return { accountId, videoRelPaths: [...paths] };
}

/** 既知の総量に対して受信が足りない、または 0 バイトなら未完了 */
export function isFinishedVideoDownload(
  received: number,
  total: number,
): boolean {
  if (!(received > 0)) {
    return false;
  }
  if (total > 0 && received < total) {
    return false;
  }
  return true;
}

/** 保存済みとして開けない途中ファイルか（記録サイズの 90% 未満） */
export function isIncompleteVideoFile(
  fileBytes: number,
  expectedBytes?: number | null,
): boolean {
  if (!(fileBytes > 0)) {
    return true;
  }
  if (
    expectedBytes != null &&
    expectedBytes >= 1024 &&
    fileBytes < Math.floor(expectedBytes * 0.9)
  ) {
    return true;
  }
  return false;
}

export function leftoverVideoRelPaths(
  found: string[],
  protectedPaths: Iterable<string>,
): string[] {
  const keep = new Set([...protectedPaths].filter((path) => path.length > 0));
  return [...new Set(found)].filter((path) => !keep.has(path));
}
