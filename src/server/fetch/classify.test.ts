import { describe, expect, it } from "vitest";
import { classifyArticleScope, looksLikePaywall, scopeLabel } from "./classify";

describe("classifyArticleScope", () => {
  it("maps blocked, length and metadata to the 15.2 scopes", () => {
    expect(
      classifyArticleScope({
        blocked: true,
        textLength: 800,
        hasMetadata: true,
      }),
    ).toBe("metadata_only");
    expect(
      classifyArticleScope({
        blocked: false,
        textLength: 800,
        hasMetadata: true,
      }),
    ).toBe("full");
    expect(
      classifyArticleScope({
        blocked: false,
        textLength: 120,
        hasMetadata: true,
      }),
    ).toBe("partial");
    expect(
      classifyArticleScope({
        blocked: false,
        textLength: 0,
        hasMetadata: true,
      }),
    ).toBe("metadata_only");
    expect(
      classifyArticleScope({
        blocked: false,
        textLength: 0,
        hasMetadata: false,
        failed: true,
      }),
    ).toBe("failed");
  });
});

describe("looksLikePaywall / scopeLabel", () => {
  it("detects paywall copy and labels scopes in Japanese", () => {
    expect(looksLikePaywall("Subscribe to continue reading")).toBe(true);
    expect(looksLikePaywall("普通の本文です")).toBe(false);
    expect(scopeLabel("full")).toBe("全文");
    expect(scopeLabel("partial")).toBe("一部");
    expect(scopeLabel("metadata_only")).toBe("概要のみ");
    expect(scopeLabel("failed")).toBe("失敗");
    expect(scopeLabel("pending")).toBe("取得待ち");
  });
});
