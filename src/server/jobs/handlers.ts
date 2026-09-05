import { logger } from "@/lib/logger";
import { articleFetch } from "@/server/jobs/handlers/articleFetch";
import { enrichBatch } from "@/server/jobs/handlers/enrichBatch";
import { expandThread } from "@/server/jobs/handlers/expandThread";
import { fetchParent } from "@/server/jobs/handlers/fetchParent";
import { mediaDownload } from "@/server/jobs/handlers/mediaDownload";
import { replyContext } from "@/server/jobs/handlers/replyContext";
import { syncBookmarks } from "@/server/jobs/handlers/syncBookmarks";
import type { JobRow } from "@/server/jobs/types";

export async function runHandler(job: JobRow): Promise<void> {
  const payload = parsePayload(job.payload_json);
  switch (job.type) {
    case "sync_bookmarks":
      await syncBookmarks(payload);
      return;
    case "media_download":
      await mediaDownload(payload);
      return;
    case "fetch_parent":
      await fetchParent(payload);
      return;
    case "expand_thread":
      await expandThread(payload);
      return;
    case "reply_context":
      await replyContext(payload);
      return;
    case "article_fetch":
      await articleFetch(payload);
      return;
    case "enrich_batch":
      await enrichBatch();
      return;
    default:
      logger.info({ jobId: job.id, type: job.type }, "job stub");
  }
}

function parsePayload(raw: string): {
  x_account_id?: string;
  trigger?: "schedule" | "manual";
  media_id?: string;
  account_id?: string;
  tweet_id?: string;
  article_id?: string;
  conversation_id?: string;
  source_id?: string;
  author_username?: string | null;
  force?: boolean;
} {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object") {
      return {};
    }
    return {
      x_account_id:
        typeof value.x_account_id === "string" ? value.x_account_id : undefined,
      trigger:
        value.trigger === "manual" || value.trigger === "schedule"
          ? value.trigger
          : undefined,
      media_id: typeof value.media_id === "string" ? value.media_id : undefined,
      account_id:
        typeof value.account_id === "string" ? value.account_id : undefined,
      tweet_id: typeof value.tweet_id === "string" ? value.tweet_id : undefined,
      article_id:
        typeof value.article_id === "string" ? value.article_id : undefined,
      conversation_id:
        typeof value.conversation_id === "string"
          ? value.conversation_id
          : undefined,
      source_id:
        typeof value.source_id === "string" ? value.source_id : undefined,
      author_username:
        typeof value.author_username === "string"
          ? value.author_username
          : undefined,
      force: value.force === true,
    };
  } catch {
    return {};
  }
}
