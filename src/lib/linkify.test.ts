import { describe, expect, it } from "vitest";
import { sanitizeHttpUrl, splitHttpUrls } from "@/lib/linkify";

describe("sanitizeHttpUrl", () => {
  it("keeps http(s) and drops trailing punctuation", () => {
    expect(sanitizeHttpUrl("https://example.com/a。")).toBe(
      "https://example.com/a",
    );
    expect(sanitizeHttpUrl("http://example.com/a,")).toBe(
      "http://example.com/a",
    );
  });

  it("rejects non-http schemes", () => {
    expect(sanitizeHttpUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("splitHttpUrls", () => {
  it("keeps plain text as one part", () => {
    expect(splitHttpUrls("リンクはありません")).toEqual([
      { text: "リンクはありません", offset: 0 },
    ]);
  });

  it("splits urls out of surrounding text", () => {
    expect(splitHttpUrls("see https://example.com/a, and more")).toEqual([
      { text: "see ", offset: 0 },
      {
        text: "https://example.com/a",
        href: "https://example.com/a",
        offset: 4,
      },
      { text: ",", offset: 25 },
      { text: " and more", offset: 26 },
    ]);
  });

  it("keeps multiple urls", () => {
    const parts = splitHttpUrls(
      "https://example.com/a and https://x.com/i/article/1",
    );
    expect(parts.filter((part) => part.href).map((part) => part.href)).toEqual([
      "https://example.com/a",
      "https://x.com/i/article/1",
    ]);
  });
});
