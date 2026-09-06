import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGoogleAuthorizeUrl, googleIdentityAllowed } from "./google";

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
