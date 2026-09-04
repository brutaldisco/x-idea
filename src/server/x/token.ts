import { logger } from "@/lib/logger";
import {
  markXAccountReauth,
  updateXAccountTokens,
  type XAccountSecret,
} from "@/server/x/account";
import type { TokenResponse } from "@/server/x/oauth";

const REFRESH_SKEW_MS = 5 * 60 * 1000;

export class TokenRefreshError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TokenRefreshError";
    this.status = status;
  }
}

export function needsRefresh(expiresAt: string, now = Date.now()): boolean {
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) {
    return true;
  }
  return at - REFRESH_SKEW_MS <= now;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  if (process.env.MOCK_EXTERNAL === "1") {
    return {
      access_token: "mock-access",
      refresh_token: refreshToken || "mock-refresh",
      expires_in: 7200,
    };
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.X_CLIENT_ID ?? "",
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (process.env.X_CLIENT_SECRET) {
    headers.Authorization = `Basic ${Buffer.from(
      `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`,
    ).toString("base64")}`;
  }
  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    throw new TokenRefreshError(
      res.status,
      `token refresh failed (${res.status})`,
    );
  }
  return (await res.json()) as TokenResponse;
}

export async function ensureValidToken(
  account: XAccountSecret,
): Promise<string> {
  if (!needsRefresh(account.tokenExpiresAt)) {
    return account.accessToken;
  }
  if (!account.refreshToken) {
    await markXAccountReauth(account.id);
    throw new TokenRefreshError(401, "refresh_token missing");
  }
  try {
    const tokens = await refreshAccessToken(account.refreshToken);
    await updateXAccountTokens(account.id, tokens);
    logger.info({ id: account.id }, "x token refreshed");
    return tokens.access_token;
  } catch (error) {
    const status =
      error instanceof TokenRefreshError ? error.status : undefined;
    if (status === 400 || status === 401) {
      await markXAccountReauth(account.id);
    }
    throw error;
  }
}
