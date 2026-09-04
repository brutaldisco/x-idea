import { persistContextTweets } from "@/server/ingest/context";
import { getContextSettings } from "@/server/settings";
import { estimatePostReadUsd } from "@/server/usage/estimate";
import { getXAccountSecret } from "@/server/x/account";
import { searchRecentConversation } from "@/server/x/client";
import { canSpendContext, writeContextRun } from "@/server/x/context-spend";
import { ensureValidToken } from "@/server/x/token";

export async function replyContext(payload: {
  conversation_id?: string;
  account_id?: string;
  source_id?: string;
}): Promise<void> {
  if (!payload.conversation_id || !payload.account_id) {
    throw new Error("reply_context payload missing");
  }
  const settings = await getContextSettings();
  if (!settings.xApiEnabled || !settings.replyContextEnabled) {
    return;
  }
  if (!(await canSpendContext(estimatePostReadUsd(25)))) {
    await writeContextRun({
      accountId: payload.account_id,
      mode: "reply_context",
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
  const token = await ensureValidToken(account);
  const page = await searchRecentConversation(
    token,
    `conversation_id:${payload.conversation_id}`,
    25,
  );
  await persistContextTweets({
    accountId: account.id,
    page,
    tweets: page.tweets,
    skipTweetId: payload.conversation_id,
    threadRootId: payload.conversation_id,
  });
  await writeContextRun({
    accountId: account.id,
    mode: "reply_context",
    resources: page.resourcesRead,
    status: "ok",
  });
}
