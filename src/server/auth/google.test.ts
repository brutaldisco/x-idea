import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginGoogleOauth,
  buildGoogleAuthorizeUrl,
  callbackUriForRequest,
  decryptGooglePayload,
  googleIdentityAllowed,
} from "./google";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildGoogleAuthorizeUrl", () => {
  it("asks for email with PKCE and a login hint", () => {
    const url = buildGoogleAuthorizeUrl({
      clientId: "cid",
      redirectUri: "http://localhost:3344/api/auth/google/callback",
      state: "st",
      challenge: "ch",
      loginHint: "you@example.com",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(parsed.searchParams.get("scope")).toBe("openid email");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("login_hint")).toBe("you@example.com");
    expect(parsed.searchParams.get("prompt")).toBe("select_account");
  });
});

describe("callbackUriForRequest", () => {
  it("keeps localhost and falls back off unknown hosts", () => {
    vi.stubEnv("APP_URL", "https://x-idea.vercel.app");
    vi.stubEnv("GOOGLE_REDIRECT_URI", "");
    expect(
      callbackUriForRequest("http://localhost:3344/api/auth/google/start"),
    ).toBe("http://localhost:3344/api/auth/google/callback");
    expect(
      callbackUriForRequest(
        "https://x-idea-preview.vercel.app/api/auth/google/start",
      ),
    ).toBe("https://x-idea.vercel.app/api/auth/google/callback");
  });
});

describe("beginGoogleOauth", () => {
  it("puts a decryptable PKCE payload in the OAuth state", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "you@example.com");
    vi.stubEnv("SESSION_SECRET", "test-secret");
    const started = beginGoogleOauth(
      "/library",
      "https://x-idea.vercel.app/api/auth/google/callback",
    );
    const parsed = new URL(started.url);
    const state = parsed.searchParams.get("state");
    expect(state).toBe(started.cookie);
    expect(decryptGooglePayload(state ?? undefined)).toMatchObject({
      next: "/library",
      redirectUri: "https://x-idea.vercel.app/api/auth/google/callback",
    });
  });
});

describe("googleIdentityAllowed", () => {
  it("requires a verified allowlisted address", () => {
    vi.stubEnv("ALLOWED_GOOGLE_EMAIL", "you@example.com");
    expect(
      googleIdentityAllowed({ email: "you@example.com", emailVerified: true }),
    ).toBe(true);
    expect(
      googleIdentityAllowed({ email: "you@example.com", emailVerified: false }),
    ).toBe(false);
    expect(
      googleIdentityAllowed({
        email: "other@example.com",
        emailVerified: true,
      }),
    ).toBe(false);
  });
});
