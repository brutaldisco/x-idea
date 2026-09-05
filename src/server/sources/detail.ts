import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { formatDuration } from "@/server/media/select";
import { sourceScopeSql } from "@/server/sources/scope";
import { type AccountContext, contextAccountId } from "@/server/x/context";

export type MediaItem = {
  id: string;
  type: string;
  altText: string | null;
  previewUrl: string | null;
  remoteUrl: string | null;
  downloadStatus: string;
  downloadError: string | null;
  durationMs: number | null;
  durationLabel: string | null;
  width: number | null;
  height: number | null;
  src: string;
  previewSrc: string;
};

export type PostCard = {
  id: string;
  tweetId: string;
  conversationId: string;
  url: string;
  text: string;
  lang: string | null;
  authorUsername: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  postedAt: string | null;
  isReply: boolean;
  replyToTweetId: string | null;
  quotedTweetId: string | null;
  quotedSnapshot: { text?: string; id?: string } | null;
  media: MediaItem[];
};

export type SourceDetail = {
  id: string;
  xAccountId: string | null;
  availability: string;
  triageStatus: string;
  userNote: string | null;
  aiSummary: string | null;
  post: PostCard;
  parent: PostCard | null;
  thread: PostCard[];
  replies: PostCard[];
  articles: {
    id: string;
    title: string | null;
    url: string;
    scope: string;
    description: string | null;
    contentText: string | null;
  }[];
};

function asMedia(row: Record<string, unknown>): MediaItem {
  const status = String(row.download_status ?? "pending");
  const id = String(row.id);
  const remote = row.media_url ? String(row.media_url) : null;
  const preview = row.preview_url ? String(row.preview_url) : null;
  const durationMs = row.duration_ms == null ? null : Number(row.duration_ms);
  return {
    id,
    type: String(row.type),
    altText: row.alt_text ? String(row.alt_text) : null,
    previewUrl: preview,
    remoteUrl: remote,
    downloadStatus: status,
    downloadError: row.download_error ? String(row.download_error) : null,
    durationMs,
    durationLabel: durationMs != null ? formatDuration(durationMs).label : null,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    src: `/api/media/${id}`,
    previewSrc: `/api/media/${id}?preview=1`,
  };
}

function asPost(row: Record<string, unknown>, media: MediaItem[]): PostCard {
  let quoted: PostCard["quotedSnapshot"] = null;
  if (row.quoted_snapshot_json) {
    try {
      quoted = JSON.parse(String(row.quoted_snapshot_json)) as {
        text?: string;
        id?: string;
      };
    } catch {
      quoted = null;
    }
  }
  return {
    id: String(row.id),
    tweetId: String(row.tweet_id),
    conversationId: row.conversation_id
      ? String(row.conversation_id)
      : String(row.tweet_id),
    url: String(row.url),
    text: String(row.text ?? ""),
    lang: row.lang ? String(row.lang) : null,
    authorUsername: row.author_username ? String(row.author_username) : null,
    authorName: row.author_name ? String(row.author_name) : null,
    authorAvatarUrl: row.author_avatar_url
      ? String(row.author_avatar_url)
      : null,
    postedAt: row.posted_at ? String(row.posted_at) : null,
    isReply: Number(row.is_reply ?? 0) === 1,
    replyToTweetId: row.reply_to_tweet_id
      ? String(row.reply_to_tweet_id)
      : Number(row.is_reply ?? 0) === 1 &&
          row.conversation_id &&
          String(row.conversation_id) !== String(row.tweet_id)
        ? String(row.conversation_id)
        : null,
    quotedTweetId: row.quoted_tweet_id ? String(row.quoted_tweet_id) : null,
    quotedSnapshot: quoted,
    media,
  };
}

async function loadMedia(postId: string): Promise<MediaItem[]> {
  const result = await getClient().execute({
    sql: `SELECT id, type, alt_text, preview_url, media_url, download_status,
                 download_error, duration_ms, width, height
          FROM media_assets WHERE x_post_id = ? ORDER BY created_at LIMIT 8`,
    args: [postId],
  });
  return result.rows.map((row) => asMedia(row as Record<string, unknown>));
}

async function loadPostByTweetId(tweetId: string): Promise<PostCard | null> {
  const result = await getClient().execute({
    sql: `SELECT id, tweet_id, conversation_id, url, text, lang, author_username,
                 author_name, author_avatar_url, posted_at, is_reply,
                 reply_to_tweet_id, quoted_tweet_id, quoted_snapshot_json
          FROM x_posts WHERE tweet_id = ? LIMIT 1`,
    args: [tweetId],
  });
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return asPost(
    row as Record<string, unknown>,
    await loadMedia(String(row.id)),
  );
}

export async function getSourceDetail(
  id: string,
  ctx: AccountContext,
): Promise<SourceDetail | null> {
  if (!isDbConfigured()) {
    return null;
  }
  await ensureSchema();
  const scope = sourceScopeSql(contextAccountId(ctx), "s");
  const result = await getClient().execute({
    sql: `SELECT s.id, s.x_account_id, s.availability, s.triage_status,
                 s.user_note, s.ai_summary,
                 p.id AS post_id, p.tweet_id, p.url, p.text, p.lang,
                 p.author_username, p.author_name, p.author_avatar_url,
                 p.posted_at, p.is_reply, p.reply_to_tweet_id, p.quoted_tweet_id,
                 p.quoted_snapshot_json, p.conversation_id
          FROM sources s
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE s.id = ? AND ${scope.clause}
          LIMIT 1`,
    args: [id, ...scope.args],
  });
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const post = asPost(
    {
      id: row.post_id,
      tweet_id: row.tweet_id,
      conversation_id: row.conversation_id,
      url: row.url,
      text: row.text,
      lang: row.lang,
      author_username: row.author_username,
      author_name: row.author_name,
      author_avatar_url: row.author_avatar_url,
      posted_at: row.posted_at,
      is_reply: row.is_reply,
      reply_to_tweet_id: row.reply_to_tweet_id,
      quoted_tweet_id: row.quoted_tweet_id,
      quoted_snapshot_json: row.quoted_snapshot_json,
    },
    await loadMedia(String(row.post_id)),
  );

  const conversationId = row.conversation_id
    ? String(row.conversation_id)
    : post.tweetId;
  const parent = post.replyToTweetId
    ? await loadPostByTweetId(post.replyToTweetId)
    : null;

  const extras = await getClient().execute({
    sql: `SELECT id, tweet_id, conversation_id, url, text, lang, author_username,
                 author_name, author_avatar_url, posted_at, is_reply,
                 reply_to_tweet_id, quoted_tweet_id, quoted_snapshot_json,
                 author_id
          FROM x_posts
          WHERE conversation_id = ? AND tweet_id != ?
          ORDER BY posted_at ASC, tweet_id ASC
          LIMIT 25`,
    args: [conversationId, post.tweetId],
  });

  const bookmarkAuthor = await getClient().execute({
    sql: "SELECT author_id FROM x_posts WHERE id = ? LIMIT 1",
    args: [String(row.post_id)],
  });
  const authorId = bookmarkAuthor.rows[0]?.author_id
    ? String(bookmarkAuthor.rows[0].author_id)
    : null;

  const thread: PostCard[] = [];
  const replies: PostCard[] = [];
  for (const extra of extras.rows) {
    const card = asPost(
      extra as Record<string, unknown>,
      await loadMedia(String(extra.id)),
    );
    if (parent && card.tweetId === parent.tweetId) {
      continue;
    }
    if (authorId && String(extra.author_id) === authorId) {
      thread.push(card);
    } else {
      replies.push(card);
    }
  }

  const articles = await getClient().execute({
    sql: `SELECT a.id, a.title, a.original_url, a.fetch_scope, a.description,
                 a.content_text
          FROM source_articles sa
          JOIN articles a ON a.id = sa.article_id
          WHERE sa.source_id = ?
          LIMIT 8`,
    args: [id],
  });

  return {
    id: String(row.id),
    xAccountId: row.x_account_id ? String(row.x_account_id) : null,
    availability: String(row.availability),
    triageStatus: String(row.triage_status),
    userNote: row.user_note ? String(row.user_note) : null,
    aiSummary: row.ai_summary ? String(row.ai_summary) : null,
    post,
    parent,
    thread,
    replies,
    articles: articles.rows.map((item) => ({
      id: String(item.id),
      title: item.title ? String(item.title) : null,
      url: String(item.original_url),
      scope: String(item.fetch_scope),
      description: item.description ? String(item.description) : null,
      contentText: item.content_text ? String(item.content_text) : null,
    })),
  };
}
