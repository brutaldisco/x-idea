import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  challengeS256,
  createState,
  createVerifier,
  X_SCOPES,
} from "@/server/x/pkce";

export const OAUTH_COOKIE = "x_oauth";
const TTL_MS = 10 * 60 * 1000;

export type OauthPayload = {
  state: string;
  verifier: string;
  exp: number;
  intent?: "link" | "add";
  next?: string;
};

export function normalizeXHint(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim().replace(/^@+/, "");
  if (trimmed.length < 1 || trimmed.length > 254) {
    return null;
  }
  if (/\s/.test(trimmed) || trimmed.includes("://")) {
    return null;
  }
  return trimmed;
}

export function safeNextPath(raw: string | null | undefined): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\")
  ) {
    return "/settings";
  }
  return raw;
}

export function withQuery(path: string, key: string, value: string): string {
  const url = new URL(path, "https://x-idea.vercel.app");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  forceLogin?: boolean;
  screenName?: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: X_SCOPES,
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  });
  if (input.forceLogin) {
    params.set("force_login", "true");
  }
  if (input.screenName) {
    params.set("screen_name", input.screenName);
  }
  return `https://x.com/i/oauth2/authorize?${params.toString()}`;
}

export function wrapForceLoginSession(authorizeUrl: string): string {
  const logout = new URL("https://x.com/logout");
  logout.searchParams.set("redirect_after_logout", authorizeUrl);
  return logout.toString();
}

function aesKey(): Buffer {
  return createHash("sha256")
    .update(
      process.env.SESSION_SECRET || process.env.X_CLIENT_SECRET || "dev-only",
    )
    .digest();
}

export function encryptPayload(payload: OauthPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptPayload(value: string | undefined): OauthPayload | null {
  if (!value) {
    return null;
  }
  try {
    const raw = Buffer.from(value, "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", aesKey(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(json) as OauthPayload;
    if (!parsed.state || !parsed.verifier || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function beginOauth(
  options: {
    forceLogin?: boolean;
    screenName?: string;
    intent?: "link" | "add";
    next?: string;
  } = {},
): { url: string; cookie: string } {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) {
    throw new Error("X_CLIENT_ID is not set");
  }
  const verifier = createVerifier();
  const state = createState();
  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri: redirectUri(),
    state,
    challenge: challengeS256(verifier),
    forceLogin: options.forceLogin,
    screenName: options.screenName,
  });
  return {
    url: options.forceLogin
      ? wrapForceLoginSession(authorizeUrl)
      : authorizeUrl,
    cookie: encryptPayload({
      state,
      verifier,
      exp: Date.now() + TTL_MS,
      intent: options.intent ?? "link",
      next: safeNextPath(options.next ?? "/onboarding?step=3"),
    }),
  };
}

export function redirectUri(): string {
  return (
    process.env.X_REDIRECT_URI ||
    `${process.env.APP_URL ?? "https://x-idea.vercel.app"}/api/x/oauth/callback`
  );
}

export function appUrl(): string {
  return process.env.APP_URL ?? "https://x-idea.vercel.app";
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export async function exchangeCode(
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
    client_id: process.env.X_CLIENT_ID ?? "",
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (process.env.X_CLIENT_SECRET) {
    const basic = Buffer.from(
      `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`,
    ).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }
  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    throw new Error(`token exchange failed (${res.status})`);
  }
  return (await res.json()) as TokenResponse;
}

export type XMe = {
  id: string;
  username: string;
  name?: string;
  profile_image_url?: string;
};

export async function fetchMe(accessToken: string): Promise<XMe> {
  const res = await fetch(
    "https://api.x.com/2/users/me?user.fields=profile_image_url,name,username",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw new Error(`users/me failed (${res.status})`);
  }
  const json = (await res.json()) as { data: XMe };
  return json.data;
}
