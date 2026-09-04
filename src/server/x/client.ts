import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withRetry } from "@/lib/retry";
import { type BookmarksPage, parseBookmarksPage } from "@/server/x/parse";

export class XApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "XApiError";
    this.status = status;
  }
}

export const BOOKMARK_QUERY = {
  max_results: "100",
  "tweet.fields":
    "id,text,author_id,created_at,lang,entities,attachments,referenced_tweets,conversation_id,note_tweet",
  expansions:
    "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id",
  "user.fields": "username,name,profile_image_url",
  "media.fields":
    "media_key,type,url,preview_image_url,alt_text,duration_ms,width,height",
} as const;

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

function loadFixture(): unknown {
  const path = join(process.cwd(), "fixtures/x/bookmarks-page.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

export async function fetchBookmarksPage(
  accessToken: string,
  xUserId: string,
  paginationToken?: string | null,
): Promise<BookmarksFetch> {
  if (process.env.MOCK_EXTERNAL === "1") {
    return {
      ...parseBookmarksPage(loadFixture()),
      rateLimit: { remaining: 179, reset: null },
    };
  }

  return withRetry(
    async () => {
      const params = new URLSearchParams(BOOKMARK_QUERY);
      if (paginationToken) {
        params.set("pagination_token", paginationToken);
      }
      const res = await fetch(
        `https://api.x.com/2/users/${encodeURIComponent(xUserId)}/bookmarks?${params}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        },
      );
      const rateLimit = readRateLimit(res.headers);
      if (!res.ok) {
        throw new XApiError(res.status, `bookmarks failed (${res.status})`);
      }
      const body: unknown = await res.json();
      return { ...parseBookmarksPage(body), rateLimit };
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
