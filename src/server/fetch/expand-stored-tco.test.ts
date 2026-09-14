import { describe, expect, it } from "vitest";
import { rewriteStoredTco } from "./expand-stored-tco";

const entities = {
  urls: [
    {
      url: "https://t.co/JWMgU9C16v",
      expanded_url: "https://github.com/acme/repo",
    },
  ],
};

describe("rewriteStoredTco", () => {
  it("expands t.co in stored post and article fields", () => {
    const out = rewriteStoredTco({
      text: "資料は https://t.co/JWMgU9C16v です",
      html: "<p>資料は https://t.co/JWMgU9C16v です</p>",
      entitiesJson: entities,
    });
    expect(out.changed).toBe(true);
    expect(out.text).toBe("資料は https://github.com/acme/repo です");
    expect(out.html).toContain('href="https://github.com/acme/repo"');
    expect(out.html).not.toContain("t.co");
  });

  it("leaves rows unchanged when entities do not match", () => {
    const text = "資料は https://t.co/JWMgU9C16v です";
    const out = rewriteStoredTco({
      text,
      entitiesJson: {
        urls: [
          {
            url: "https://t.co/article",
            expanded_url: "https://x.com/i/article/99",
          },
        ],
      },
    });
    expect(out.changed).toBe(false);
    expect(out.text).toBe(text);
  });
});
