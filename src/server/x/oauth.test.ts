import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  callbackUriForRequest,
  normalizeXHint,
  safeNextPath,
  withQuery,
  wrapForceLoginSession,
} from "./oauth";

describe("normalizeXHint", () => {
  it("strips @ and rejects blanks or URLs", () => {
    expect(normalizeXHint(" @alice ")).toBe("alice");
    expect(normalizeXHint("mail@example.com")).toBe("mail@example.com");
    expect(normalizeXHint("")).toBeNull();
    expect(normalizeXHint("two words")).toBeNull();
    expect(normalizeXHint("https://x.com/alice")).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("allows only same-origin paths", () => {
    expect(safeNextPath("/settings")).toBe("/settings");
    expect(safeNextPath("/onboarding?step=3")).toBe("/onboarding?step=3");
    expect(safeNextPath("https://evil.example/")).toBe("/settings");
    expect(safeNextPath("//evil.example")).toBe("/settings");
  });
});

describe("oauth urls", () => {
  it("adds force_login and screen_name", () => {
    const url = buildAuthorizeUrl({
      clientId: "cid",
      redirectUri: "https://x-idea.vercel.app/api/x/oauth/callback",
      state: "st",
      challenge: "ch",
      forceLogin: true,
      screenName: "alice",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://x.com/i/oauth2/authorize",
    );
    expect(parsed.searchParams.get("force_login")).toBe("true");
    expect(parsed.searchParams.get("screen_name")).toBe("alice");
    expect(parsed.searchParams.get("scope") ?? "").toContain("bookmark.write");
  });

  it("wraps authorize behind X logout", () => {
    const authorize = "https://x.com/i/oauth2/authorize?state=st";
    const wrapped = wrapForceLoginSession(authorize);
    const parsed = new URL(wrapped);
    expect(parsed.origin + parsed.pathname).toBe("https://x.com/logout");
    expect(parsed.searchParams.get("redirect_after_logout")).toBe(authorize);
  });

  it("appends query without dropping existing params", () => {
    expect(withQuery("/onboarding?step=3", "x", "same")).toBe(
      "/onboarding?step=3&x=same",
    );
  });

  it("keeps localhost callback when the request started locally", () => {
    expect(
      callbackUriForRequest("http://localhost:3344/api/x/oauth/start"),
    ).toBe("http://localhost:3344/api/x/oauth/callback");
  });
});
