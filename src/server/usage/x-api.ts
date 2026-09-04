import { logger } from "@/lib/logger";
import {
  parseCreditBalance,
  parseTweetUsageDays,
} from "@/server/usage/estimate";

const CREDITS_URL = "https://api.x.com/2/usage/credits";
const TWEETS_URL = "https://api.x.com/2/usage/tweets";
const TIMEOUT_MS = 5_000;

export type XUsageLive = {
  remainingUsd: number | null;
  dailyTweets: { date: string; tweets: number }[];
  fetchedAt: string;
  error: string | null;
};

export function xBearerToken(): string | null {
  const token = process.env.X_BEARER_TOKEN?.trim();
  return token ? token : null;
}

async function getJson(
  url: string,
  token: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchXUsageLive(): Promise<XUsageLive> {
  const fetchedAt = new Date().toISOString();
  if (process.env.MOCK_EXTERNAL === "1") {
    return {
      remainingUsd: 8.5,
      dailyTweets: [],
      fetchedAt,
      error: null,
    };
  }

  const token = xBearerToken();
  if (!token) {
    return {
      remainingUsd: null,
      dailyTweets: [],
      fetchedAt,
      error: "X_BEARER_TOKEN 未設定",
    };
  }

  try {
    const [credits, tweets] = await Promise.all([
      getJson(CREDITS_URL, token),
      getJson(TWEETS_URL, token),
    ]);
    const remainingUsd = credits.ok ? parseCreditBalance(credits.body) : null;
    const dailyTweets = tweets.ok ? parseTweetUsageDays(tweets.body) : [];
    const error =
      credits.ok || remainingUsd != null ? null : `X usage ${credits.status}`;
    if (error) {
      logger.warn({ status: credits.status }, "x usage credits failed");
    }
    return { remainingUsd, dailyTweets, fetchedAt, error };
  } catch (error) {
    logger.warn({ err: error }, "x usage fetch failed");
    return {
      remainingUsd: null,
      dailyTweets: [],
      fetchedAt,
      error: "X usage API に届きませんでした",
    };
  }
}
