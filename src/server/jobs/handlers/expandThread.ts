import { persistContextTweets } from "@/server/ingest/context";
import { getContextSettings } from "@/server/settings";
import { estimatePostReadUsd } from "@/server/usage/estimate";
import { getXAccountSecret } from "@/server/x/account";
import { searchRecentConversation } from "@/server/x/client";
import { canSpendContext, writeContextRun } from "@/server/x/context-spend";
import { ensureValidToken } from "@/server/x/token";

export async function expandThread(payload: {
  tweet_id?: string;
  account_id?: string;
  author_username?: string | null;
}): Promise<void> {
  if (!payload.tweet_id || !payload.account_id) {
    throw new Error("expand_thread payload missing");
  }
  const settings = await getContextSettings();
  if (!settings.xApiEnabled || !settings.threadExpandEnabled) {
    return;
  }
  if (!(await canSpendContext(estimatePostReadUsd(25)))) {
    await writeContextRun({
      accountId: payload.account_id,
      mode: "thread",
      resources: 0,
      status: "skipped",
      error: "monthly cap",
    });
    return;
  }

  const account = await getXAccountSecret(payload.account_id);
  if (!account) {
    throw new Error("account not found");
  }
  const username = payload.author_username;
  const query = username
    ? `conversation_id:${payload.tweet_id} from:${username}`
    : `conversation_id:${payload.tweet_id}`;
  const token = await ensureValidToken(account);
  const page = await searchRecentConversation(token, query, 25);
  await persistContextTweets({
    accountId: account.id,
    page,
    tweets: page.tweets,
    skipTweetId: payload.tweet_id,
    threadRootId: payload.tweet_id,
  });
  await writeContextRun({
    accountId: account.id,
    mode: "thread",
    resources: page.resourcesRead,
    status: "ok",
  });
}
