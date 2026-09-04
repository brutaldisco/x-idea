export type XTweet = {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  lang?: string;
  conversation_id?: string;
  note_tweet?: { text?: string };
  entities?: { urls?: { expanded_url?: string; url?: string }[] };
  attachments?: { media_keys?: string[] };
  referenced_tweets?: { type: string; id: string }[];
};

export type XUser = {
  id: string;
  username?: string;
  name?: string;
  profile_image_url?: string;
};

export type XMedia = {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
  duration_ms?: number;
  width?: number;
  height?: number;
};

export type XApiErrorItem = {
  resource_id?: string;
  resource_type?: string;
  title?: string;
};

export type BookmarksPage = {
  tweets: XTweet[];
  users: Map<string, XUser>;
  media: Map<string, XMedia>;
  includedTweets: Map<string, XTweet>;
  errors: XApiErrorItem[];
  nextToken: string | null;
  resourcesRead: number;
};

export function tweetText(tweet: XTweet): string {
  const note = tweet.note_tweet?.text?.trim();
  return note && note.length > 0 ? note : tweet.text;
}

export function isReply(tweet: XTweet): boolean {
  return (tweet.referenced_tweets ?? []).some(
    (ref) => ref.type === "replied_to",
  );
}

export function quotedTweetId(tweet: XTweet): string | null {
  return (
    tweet.referenced_tweets?.find((ref) => ref.type === "quoted")?.id ?? null
  );
}

export function tweetUrls(tweet: XTweet): string[] {
  const urls = tweet.entities?.urls ?? [];
  const out: string[] = [];
  for (const item of urls) {
    const url = item.expanded_url || item.url;
    if (url && !url.startsWith("https://t.co/") && !out.includes(url)) {
      out.push(url);
    }
  }
  return out.slice(0, 8);
}

export function collectUntilHead(
  tweets: XTweet[],
  knownHead: string | null,
): { keep: XTweet[]; hitHead: boolean; pageHead: string | null } {
  const keep: XTweet[] = [];
  let hitHead = false;
  for (const tweet of tweets) {
    if (knownHead && tweet.id === knownHead) {
      hitHead = true;
      break;
    }
    keep.push(tweet);
  }
  return { keep, hitHead, pageHead: tweets[0]?.id ?? null };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asTweet(value: unknown): XTweet | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== "string") {
    return null;
  }
  const note = asRecord(row.note_tweet);
  return {
    id: row.id,
    text: typeof row.text === "string" ? row.text : "",
    author_id: typeof row.author_id === "string" ? row.author_id : undefined,
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    lang: typeof row.lang === "string" ? row.lang : undefined,
    conversation_id:
      typeof row.conversation_id === "string" ? row.conversation_id : undefined,
    note_tweet:
      note && typeof note.text === "string" ? { text: note.text } : undefined,
    entities: row.entities as XTweet["entities"],
    attachments: row.attachments as XTweet["attachments"],
    referenced_tweets: Array.isArray(row.referenced_tweets)
      ? (row.referenced_tweets as XTweet["referenced_tweets"])
      : undefined,
  };
}

export function parseBookmarksPage(payload: unknown): BookmarksPage {
  const root = asRecord(payload) ?? {};
  const tweets = Array.isArray(root.data)
    ? root.data.map(asTweet).filter((row): row is XTweet => Boolean(row))
    : [];
  const includes = asRecord(root.includes) ?? {};
  const users = new Map<string, XUser>();
  if (Array.isArray(includes.users)) {
    for (const raw of includes.users.slice(0, 200)) {
      const row = asRecord(raw);
      if (row && typeof row.id === "string") {
        users.set(row.id, {
          id: row.id,
          username: typeof row.username === "string" ? row.username : undefined,
          name: typeof row.name === "string" ? row.name : undefined,
          profile_image_url:
            typeof row.profile_image_url === "string"
              ? row.profile_image_url
              : undefined,
        });
      }
    }
  }
  const media = new Map<string, XMedia>();
  if (Array.isArray(includes.media)) {
    for (const raw of includes.media.slice(0, 200)) {
      const row = asRecord(raw);
      if (
        row &&
        typeof row.media_key === "string" &&
        typeof row.type === "string"
      ) {
        media.set(row.media_key, {
          media_key: row.media_key,
          type: row.type,
          url: typeof row.url === "string" ? row.url : undefined,
          preview_image_url:
            typeof row.preview_image_url === "string"
              ? row.preview_image_url
              : undefined,
          alt_text: typeof row.alt_text === "string" ? row.alt_text : undefined,
          duration_ms:
            typeof row.duration_ms === "number" ? row.duration_ms : undefined,
          width: typeof row.width === "number" ? row.width : undefined,
          height: typeof row.height === "number" ? row.height : undefined,
        });
      }
    }
  }
  const includedTweets = new Map<string, XTweet>();
  if (Array.isArray(includes.tweets)) {
    for (const raw of includes.tweets.slice(0, 200)) {
      const tweet = asTweet(raw);
      if (tweet) {
        includedTweets.set(tweet.id, tweet);
      }
    }
  }
  const errors: XApiErrorItem[] = [];
  if (Array.isArray(root.errors)) {
    for (const raw of root.errors.slice(0, 50)) {
      const row = asRecord(raw);
      if (row) {
        errors.push({
          resource_id:
            typeof row.resource_id === "string" ? row.resource_id : undefined,
          resource_type:
            typeof row.resource_type === "string"
              ? row.resource_type
              : undefined,
          title: typeof row.title === "string" ? row.title : undefined,
        });
      }
    }
  }
  const meta = asRecord(root.meta);
  return {
    tweets,
    users,
    media,
    includedTweets,
    errors,
    nextToken:
      meta && typeof meta.next_token === "string" ? meta.next_token : null,
    resourcesRead: tweets.length,
  };
}
