import { downloadMediaAsset } from "@/server/media/download";

export async function persistLocalMedia(input: {
  accountId: string;
  items: { id: string; type: string; downloadStatus: string }[];
}): Promise<void> {
  const pending = input.items.filter(
    (item) =>
      item.downloadStatus === "pending" || item.downloadStatus === "failed",
  );
  for (const item of pending.slice(0, 6)) {
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
