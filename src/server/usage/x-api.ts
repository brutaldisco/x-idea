import { logger } from "@/lib/logger";
import {
  parseCreditBalance,
  parseTweetUsageDays,
} from "@/server/usage/estimate";
import { listXAccountSecrets } from "@/server/x/account";
import { ensureValidToken, needsRefresh } from "@/server/x/token";

const CREDITS_URL = "https://api.x.com/2/usage/credits";
const TWEETS_URL =
  "https://api.x.com/2/usage/tweets?days=90&usage.fields=daily_project_usage,project_usage";
const CLIENT_CREDENTIALS_URLS = [
  "https://api.x.com/2/oauth2/token",
  "https://api.x.com/oauth2/token",
] as const;
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

let cachedAppBearer: { token: string; exp: number } | null = null;

async function appBearerFromClientCredentials(): Promise<string | null> {
  const clientId = process.env.X_CLIENT_ID?.trim();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }
  if (cachedAppBearer && cachedAppBearer.exp > Date.now()) {
    return cachedAppBearer.token;
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  for (const url of CLIENT_CREDENTIALS_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        continue;
      }
      const json = (await response.json().catch(() => null)) as {
        access_token?: string;
        expires_in?: number;
      } | null;
      const token = json?.access_token?.trim();
      if (token) {
        const ttlMs = Math.max(60, (json?.expires_in ?? 3600) - 60) * 1000;
        cachedAppBearer = { token, exp: Date.now() + ttlMs };
        return token;
      }
    } catch (error) {
      logger.warn({ err: error }, "x app bearer request failed");
    }
  }
  return null;
}

async function userAccessToken(): Promise<string | null> {
  const accounts = await listXAccountSecrets();
  for (const account of accounts) {
    try {
      if (!needsRefresh(account.tokenExpiresAt)) {
        return account.accessToken;
      }
      return await ensureValidToken(account);
    } catch (error) {
      logger.warn({ err: error, id: account.id }, "x usage user token skipped");
    }
  }
  return null;
}

async function resolveUsageToken(): Promise<string | null> {
  return (
    xBearerToken() ??
    (await appBearerFromClientCredentials()) ??
    (await userAccessToken())
  );
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

  const token = await resolveUsageToken();
  if (!token) {
    return {
      remainingUsd: null,
      dailyTweets: [],
      fetchedAt,
      error: null,
    };
  }

  try {
    const [credits, tweets] = await Promise.all([
      getJson(CREDITS_URL, token),
      getJson(TWEETS_URL, token),
    ]);
    const remainingUsd = credits.ok ? parseCreditBalance(credits.body) : null;
    const dailyTweets = tweets.ok ? parseTweetUsageDays(tweets.body) : [];
    if (remainingUsd == null && dailyTweets.length === 0) {
      logger.warn(
        { credits: credits.status, tweets: tweets.status },
        "x usage fetch empty",
      );
    }
    return { remainingUsd, dailyTweets, fetchedAt, error: null };
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
