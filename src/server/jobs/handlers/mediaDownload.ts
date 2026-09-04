import { downloadMediaAsset } from "@/server/media/download";

export async function mediaDownload(payload: {
  media_id?: string;
  account_id?: string;
  force?: boolean;
}): Promise<void> {
  if (!payload.media_id || !payload.account_id) {
    throw new Error("media_download payload missing");
  }
  await downloadMediaAsset({
    mediaId: payload.media_id,
    accountId: payload.account_id,
    force: payload.force === true,
  });
}
