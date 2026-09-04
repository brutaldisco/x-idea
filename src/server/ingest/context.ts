import {
  attachMedia,
  enqueueMediaDownloads,
  upsertXPost,
} from "@/server/ingest/x-post";
import type { BookmarksPage, XTweet } from "@/server/x/parse";

export async function persistContextTweets(input: {
  accountId: string;
  page: BookmarksPage;
  tweets: XTweet[];
  skipTweetId?: string;
  threadRootId?: string | null;
}): Promise<number> {
  let created = 0;
  const sorted = [...input.tweets].sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
  let index = 0;
  for (const tweet of sorted.slice(0, 25)) {
    if (input.skipTweetId && tweet.id === input.skipTweetId) {
      continue;
    }
    const { postId, created: isNew } = await upsertXPost({
      tweet,
      page: input.page,
      threadRootId: input.threadRootId ?? tweet.conversation_id ?? tweet.id,
      threadIndex: index,
    });
    index += 1;
    if (isNew) {
      created += 1;
    }
    const mediaIds = await attachMedia({
      postId,
      tweet,
      page: input.page,
      accountId: input.accountId,
    });
    await enqueueMediaDownloads(mediaIds, input.accountId);
  }
  return created;
}
