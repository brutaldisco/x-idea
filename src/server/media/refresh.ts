import { getClient } from "@/db/client";
import { logger } from "@/lib/logger";
import {
  downloadUrlFor,
  needsTweetRefresh,
  parseVariantsJson,
} from "@/server/media/select";
import { getXAccountSecret } from "@/server/x/account";
import { fetchTweetById } from "@/server/x/client";
import { ensureValidToken } from "@/server/x/token";

export async function refreshMediaFromTweet(input: {
  mediaId: string;
  accountId: string;
}): Promise<boolean> {
  const row = await getClient().execute({
    sql: `SELECT m.id, m.media_key, m.type, m.media_url, m.preview_url,
                 m.variants_json, p.tweet_id
          FROM media_assets m
          JOIN x_posts p ON p.id = m.x_post_id
          WHERE m.id = ?
          LIMIT 1`,
    args: [input.mediaId],
  });
  const media = row.rows[0];
  if (!media) {
    return false;
  }
  const type = String(media.type);
  const variantsJson = media.variants_json ? String(media.variants_json) : null;
  if (
    !needsTweetRefresh({
      type,
      media_url: media.media_url ? String(media.media_url) : null,
      variants: parseVariantsJson(variantsJson),
      variants_json: variantsJson,
    })
  ) {
    return Boolean(
      downloadUrlFor({
        type,
        media_url: media.media_url ? String(media.media_url) : null,
        variants: parseVariantsJson(variantsJson),
      }),
    );
  }

  try {
    const account = await getXAccountSecret(input.accountId);
    if (!account) {
      return false;
    }
    const token = await ensureValidToken(account);
    const page = await fetchTweetById(token, String(media.tweet_id));
    const key = String(media.media_key);
    const fresh =
      page.media.get(key) ??
      [...page.media.values()].find((item) => item.type === type) ??
      null;
    if (!fresh) {
      await getClient().execute({
        sql: "UPDATE media_assets SET variants_json = COALESCE(variants_json, '[]') WHERE id = ?",
        args: [input.mediaId],
      });
      logger.warn(
        { mediaId: input.mediaId },
        "media refresh found no attachment",
      );
      return false;
    }
    const best = downloadUrlFor({
      type: fresh.type,
      media_url: fresh.url,
      variants: fresh.variants,
    });
    await getClient().execute({
      sql: `UPDATE media_assets SET
        media_url = COALESCE(?, media_url),
        preview_url = COALESCE(?, preview_url),
        variants_json = ?,
        duration_ms = COALESCE(?, duration_ms),
        width = COALESCE(?, width),
        height = COALESCE(?, height),
        alt_text = COALESCE(?, alt_text)
        WHERE id = ?`,
      args: [
        best ?? fresh.url ?? null,
        fresh.preview_image_url ?? null,
        JSON.stringify(fresh.variants ?? []),
        fresh.duration_ms ?? null,
        fresh.width ?? null,
        fresh.height ?? null,
        fresh.alt_text ?? null,
        input.mediaId,
      ],
    });
    logger.info({ mediaId: input.mediaId }, "media urls refreshed from tweet");
    return Boolean(best ?? fresh.url ?? fresh.preview_image_url);
  } catch (error) {
    logger.warn({ err: error, mediaId: input.mediaId }, "media refresh failed");
    return false;
  }
}
