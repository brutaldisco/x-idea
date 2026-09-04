import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { enqueueJob } from "@/server/jobs/queue";
import { runJobs } from "@/server/jobs/runner";
import { getContextSettings } from "@/server/settings";
import { getSourceDetail } from "@/server/sources/detail";
import { getAccountContext } from "@/server/x/context";

export const instant = false;
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
    };
    const ctx = await getAccountContext();
    const source = await getSourceDetail(id, ctx);
    if (!source?.xAccountId) {
      return Response.json(
        toErrorBody(new AppError("NOT_FOUND", "Source がありません")),
        { status: 404 },
      );
    }
    const settings = await getContextSettings();
    if (!settings.xApiEnabled) {
      return Response.json(
        toErrorBody(new AppError("X_DISABLED", "X API が OFF です")),
        { status: 409 },
      );
    }

    if (body.kind === "parent") {
      if (!source.post.replyToTweetId) {
        return Response.json(
          toErrorBody(new AppError("VALIDATION", "返信先がありません")),
          { status: 400 },
        );
      }
      await enqueueJob({
        type: "fetch_parent",
        payload: {
          tweet_id: source.post.replyToTweetId,
          account_id: source.xAccountId,
          source_id: source.id,
        },
        dedupeKey: `fetch_parent:${source.post.replyToTweetId}`,
      });
    } else if (body.kind === "thread") {
      if (!settings.threadExpandEnabled) {
        return Response.json(
          toErrorBody(new AppError("X_DISABLED", "スレッド展開が OFF です")),
          { status: 409 },
        );
      }
      await enqueueJob({
        type: "expand_thread",
        payload: {
          tweet_id: source.post.tweetId,
          account_id: source.xAccountId,
          author_username: source.post.authorUsername,
          source_id: source.id,
        },
        dedupeKey: `expand_thread:${source.post.tweetId}`,
      });
    } else if (body.kind === "replies") {
      if (!settings.replyContextEnabled) {
        return Response.json(
          toErrorBody(new AppError("X_DISABLED", "返信取得が OFF です")),
          { status: 409 },
        );
      }
      await enqueueJob({
        type: "reply_context",
        payload: {
          conversation_id: source.post.conversationId,
          account_id: source.xAccountId,
          source_id: source.id,
        },
        dedupeKey: `reply_context:${source.post.conversationId}`,
      });
    } else {
      return Response.json(
        toErrorBody(new AppError("VALIDATION", "kind が必要です")),
        { status: 400 },
      );
    }

    const result = await runJobs({ max: 2 });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
