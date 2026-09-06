import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { emailAllowed, googleGateConfigured } from "@/lib/gate";
import { challengeS256, createState, createVerifier } from "@/server/x/pkce";

export const GOOGLE_OAUTH_COOKIE = "g_oauth";
const TTL_MS = 10 * 60 * 1000;
const SCOPES = "openid email";

export type GoogleOauthPayload = {
  state: string;
  verifier: string;
  exp: number;
  next?: string;
};

export type GoogleIdentity = {
  email: string;
  emailVerified: boolean;
};

function aesKey(): Buffer {
  return createHash("sha256")
    .update(
      process.env.SESSION_SECRET ||
        process.env.GOOGLE_CLIENT_SECRET ||
        "dev-only",
    )
    .digest();
}

export function encryptGooglePayload(payload: GoogleOauthPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptGooglePayload(
  value: string | undefined,
): GoogleOauthPayload | null {
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
    const parsed = JSON.parse(json) as GoogleOauthPayload;
    if (!parsed.state || !parsed.verifier || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function googleRedirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.APP_URL ?? "https://x-idea.vercel.app"}/api/auth/google/callback`
  );
}

export function appUrl(): string {
  return process.env.APP_URL ?? "https://x-idea.vercel.app";
}

export function buildGoogleAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  loginHint?: string | null;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: SCOPES,
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    access_type: "online",
  });
  if (input.loginHint) {
    params.set("login_hint", input.loginHint);
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function beginGoogleOauth(next?: string): {
  url: string;
  cookie: string;
} {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !googleGateConfigured()) {
    throw new Error("Google gate is not configured");
  }
  const verifier = createVerifier();
  const state = createState();
  return {
    url: buildGoogleAuthorizeUrl({
      clientId,
      redirectUri: googleRedirectUri(),
      state,
      challenge: challengeS256(verifier),
      loginHint: process.env.ALLOWED_GOOGLE_EMAIL ?? null,
    }),
    cookie: encryptGooglePayload({
      state,
      verifier,
      exp: Date.now() + TTL_MS,
      next,
    }),
  };
}

export async function exchangeGoogleCode(
  code: string,
  verifier: string,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: googleRedirectUri(),
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    code_verifier: verifier,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`google token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("google token missing");
  }
  return json.access_token;
}

export async function fetchGoogleIdentity(
  accessToken: string,
): Promise<GoogleIdentity> {
  const res = await fetch("https://openidconnect.googleapis.com/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`google userinfo failed (${res.status})`);
  }
  const json = (await res.json()) as {
    email?: string;
    email_verified?: boolean;
  };
  return {
    email: json.email ?? "",
    emailVerified: json.email_verified === true,
  };
}

export function googleIdentityAllowed(identity: GoogleIdentity): boolean {
  return identity.emailVerified && emailAllowed(identity.email);
}
