import { getClient } from "@/db/client";
import { persistContextTweets } from "@/server/ingest/context";
import { findPostIdByTweetId } from "@/server/ingest/x-post";
import { getXAccountSecret } from "@/server/x/account";
import { fetchTweetById, XApiError } from "@/server/x/client";
import { writeContextRun } from "@/server/x/context-spend";
import { ensureValidToken } from "@/server/x/token";

export async function fetchParent(payload: {
  tweet_id?: string;
  account_id?: string;
}): Promise<void> {
  if (!payload.tweet_id || !payload.account_id) {
    throw new Error("fetch_parent payload missing");
  }
  if (await findPostIdByTweetId(payload.tweet_id)) {
    return;
  }
  const account = await getXAccountSecret(payload.account_id);
  if (!account) {
    throw new Error("account not found");
  }
  try {
    const token = await ensureValidToken(account);
    const page = await fetchTweetById(token, payload.tweet_id);
    const tweet = page.tweets[0];
    if (!tweet) {
      await writeContextRun({
        accountId: account.id,
        mode: "parent",
        resources: page.resourcesRead,
        status: "ok",
        error: "parent missing",
      });
      return;
    }
    await persistContextTweets({
      accountId: account.id,
      page,
      tweets: [tweet],
    });
    await writeContextRun({
      accountId: account.id,
      mode: "parent",
      resources: Math.max(1, page.resourcesRead),
      status: "ok",
    });
  } catch (error) {
    if (error instanceof XApiError && error.status === 404) {
      await getClient().execute({
        sql: `UPDATE sources SET availability = 'unavailable', updated_at = datetime('now')
              WHERE x_post_id IN (SELECT id FROM x_posts WHERE reply_to_tweet_id = ? LIMIT 8)`,
        args: [payload.tweet_id],
      });
    }
    await writeContextRun({
      accountId: payload.account_id,
      mode: "parent",
      resources: 0,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
