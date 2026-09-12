import { parseVideoRelPath } from "@/lib/video-path";
import {
  ensureWritePermission,
  loadVideoRoot,
  openVideoObjectUrl,
} from "@/lib/video-store";

export type SavedVideoSource = {
  url: string;
  revoke?: () => void;
};

export async function resolveSavedVideoUrl(input: {
  mediaId: string;
  videoRelPath?: string | null;
}): Promise<SavedVideoSource> {
  if (input.videoRelPath) {
    const accountId = parseVideoRelPath(input.videoRelPath)?.accountId ?? null;
    const handle = await loadVideoRoot(accountId);
    if (handle && (await ensureWritePermission(handle))) {
      try {
        const url = await openVideoObjectUrl(handle, input.videoRelPath);
        return { url, revoke: () => URL.revokeObjectURL(url) };
      } catch {
        /* CDN にフォールバック */
      }
    }
  }
  return { url: `/api/media/${input.mediaId}/file?inline=1` };
}
