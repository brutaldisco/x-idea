import { downloadMediaAsset } from "@/server/media/download";
import { isLocalMediaEnabled } from "@/server/media/paths";

export async function persistLocalMedia(input: {
  accountId: string;
  items: { id: string; type: string; downloadStatus: string }[];
}): Promise<void> {
  if (!isLocalMediaEnabled()) {
    return;
  }
  const pending = input.items.filter(
    (item) =>
      item.downloadStatus === "pending" || item.downloadStatus === "failed",
  );
  const photos = pending.filter((item) => item.type === "photo").slice(0, 4);
  const videos = pending.filter((item) => item.type !== "photo").slice(0, 2);
  for (const item of [...photos, ...videos]) {
    try {
      await downloadMediaAsset({
        mediaId: item.id,
        accountId: input.accountId,
        force: item.downloadStatus === "failed",
      });
    } catch {
      // job retry / proxy display still covers this
    }
  }
}
