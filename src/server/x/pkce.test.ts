import { describe, expect, it } from "vitest";
import { hasOauthScope, parseOauthScopes, X_SCOPES } from "./pkce";

describe("oauth scopes", () => {
  it("includes bookmark.write for delete-on-X", () => {
    expect(X_SCOPES.split(" ")).toContain("bookmark.write");
  });

  it("reads JSON array scopes_json", () => {
    expect(
      parseOauthScopes(JSON.stringify(["bookmark.read", "tweet.read"])),
    ).toEqual(["bookmark.read", "tweet.read"]);
    expect(
      hasOauthScope(
        JSON.stringify(["bookmark.read", "bookmark.write"]),
        "bookmark.write",
      ),
    ).toBe(true);
    expect(
      hasOauthScope(JSON.stringify(["bookmark.read"]), "bookmark.write"),
    ).toBe(false);
  });
});
