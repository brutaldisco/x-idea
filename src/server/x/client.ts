import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withRetry } from "@/lib/retry";
import {
  type BookmarksPage,
  parseBookmarksPage,
  parseTweetLookup,
} from "@/server/x/parse";

export class XApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "XApiError";
    this.status = status;
  }
}

export const TWEET_FIELDS =
  "id,text,author_id,created_at,lang,entities,attachments,referenced_tweets,conversation_id,note_tweet,article";
export const TWEET_EXPANSIONS =
  "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id";
export const USER_FIELDS = "username,name,profile_image_url";
export const MEDIA_FIELDS =
  "media_key,type,url,preview_image_url,alt_text,duration_ms,width,height,variants";

export const BOOKMARK_QUERY = {
  "tweet.fields": TWEET_FIELDS,
  expansions: TWEET_EXPANSIONS,
  "user.fields": USER_FIELDS,
  "media.fields": MEDIA_FIELDS,
} as const;

export function bookmarkMaxResults(size: number): string {
  return String(Math.min(100, Math.max(10, Math.round(size))));
}

export type RateLimit = {
  remaining: number | null;
  reset: string | null;
};

export type BookmarksFetch = BookmarksPage & { rateLimit: RateLimit };

function readRateLimit(headers: Headers): RateLimit {
  const remaining = headers.get("x-rate-limit-remaining");
  const reset = headers.get("x-rate-limit-reset");
  return {
    remaining: remaining != null ? Number(remaining) : null,
    reset: reset ? new Date(Number(reset) * 1000).toISOString() : null,
  };
}

function loadFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(join(process.cwd(), "fixtures/x", name), "utf8"),
  );
}

async function xGet(
  accessToken: string,
  url: string,
): Promise<{ body: unknown; rateLimit: RateLimit }> {
  return withRetry(
    async () => {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const rateLimit = readRateLimit(res.headers);
      if (!res.ok) {
        throw new XApiError(res.status, `x api failed (${res.status})`);
      }
      return { body: await res.json(), rateLimit };
    },
    {
      attempts: 3,
      retryOn: (error) => {
        if (error instanceof XApiError) {
          return error.status === 429 || error.status >= 500;
        }
        return true;
      },
    },
  );
}

function tweetQuery(): URLSearchParams {
  return new URLSearchParams({
    "tweet.fields": TWEET_FIELDS,
    expansions: TWEET_EXPANSIONS,
    "user.fields": USER_FIELDS,
    "media.fields": MEDIA_FIELDS,
  });
}

export async function fetchBookmarksPage(
  accessToken: string,
  xUserId: string,
  paginationToken?: string | null,
  maxResults = 100,
): Promise<BookmarksFetch> {
  if (process.env.MOCK_EXTERNAL === "1") {
    return {
      ...parseBookmarksPage(loadFixture("bookmarks-page.json")),
      rateLimit: { remaining: 179, reset: null },
    };
  }

  const params = new URLSearchParams(BOOKMARK_QUERY);
  params.set("max_results", bookmarkMaxResults(maxResults));
  if (paginationToken) {
    params.set("pagination_token", paginationToken);
  }
  const { body, rateLimit } = await xGet(
    accessToken,
    `https://api.x.com/2/users/${encodeURIComponent(xUserId)}/bookmarks?${params}`,
  );
  return { ...parseBookmarksPage(body), rateLimit };
}

export async function fetchTweetById(
  accessToken: string,
  tweetId: string,
): Promise<BookmarksFetch> {
  if (process.env.MOCK_EXTERNAL === "1") {
    return {
      ...parseTweetLookup(loadFixture("tweet-lookup.json")),
      rateLimit: { remaining: 400, reset: null },
    };
  }
  const params = tweetQuery();
  const { body, rateLimit } = await xGet(
    accessToken,
    `https://api.x.com/2/tweets/${encodeURIComponent(tweetId)}?${params}`,
  );
  return { ...parseTweetLookup(body), rateLimit };
}

export async function searchRecentConversation(
  accessToken: string,
  query: string,
  maxResults = 25,
): Promise<BookmarksFetch> {
  if (process.env.MOCK_EXTERNAL === "1") {
    return {
      ...parseBookmarksPage(loadFixture("conversation-recent.json")),
      rateLimit: { remaining: 400, reset: null },
    };
  }
  const params = tweetQuery();
  params.set("query", query);
  params.set("max_results", String(Math.min(100, Math.max(10, maxResults))));
  const { body, rateLimit } = await xGet(
    accessToken,
    `https://api.x.com/2/tweets/search/recent?${params}`,
  );
  return { ...parseBookmarksPage(body), rateLimit };
}
