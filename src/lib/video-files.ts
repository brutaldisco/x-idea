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
