import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  articleSourceString,
  chromeTranslateSourceHashSync,
  loadChromeTranslations,
  postSourceString,
  resolveTranslationSource,
  upsertChromeTranslation,
} from "@/server/sources/chrome-translate";

const execute = vi.fn();

vi.mock("@/db/client", () => ({
  getClient: () => ({ execute }),
}));

describe("postSourceString", () => {
  it("joins quoted text with a blank line", () => {
    expect(
      postSourceString({
        text: "Main body",
        quotedSnapshot: { text: "Quoted tweet" },
      }),
    ).toBe("Main body\n\nQuoted tweet");
  });
});

describe("articleSourceString", () => {
  it("joins title and body and caps length", () => {
    const long = "a".repeat(13_000);
    expect(
      articleSourceString({
        title: "Title",
        contentText: long,
        description: null,
      }),
    ).toHaveLength(12_000);
    expect(
      articleSourceString({
        title: "Title",
        contentText: "Body",
        description: null,
      }),
    ).toBe("Title\n\nBody");
  });
});

describe("chromeTranslateSourceHashSync", () => {
  it("returns a stable sha256 hex digest", () => {
    expect(chromeTranslateSourceHashSync("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("loadChromeTranslations", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it("returns only rows whose hash still matches", async () => {
    const source = "English body";
    const hash = chromeTranslateSourceHashSync(source);
    execute.mockResolvedValueOnce({
      rows: [
        {
          target_kind: "x_post",
          target_id: "post1",
          source_hash: hash,
          source_lang: "en",
          text: "英語本文",
          translated_at: "2026-09-13T00:00:00Z",
        },
        {
          target_kind: "x_post",
          target_id: "post2",
          source_hash: "stale",
          source_lang: "en",
          text: "古い訳",
          translated_at: "2026-09-13T00:00:00Z",
        },
      ],
    });

    const map = await loadChromeTranslations([
      { kind: "x_post", id: "post1", source },
      { kind: "x_post", id: "post2", source },
    ]);

    expect(map.get("x_post:post1")).toEqual({
      text: "英語本文",
      sourceLang: "en",
      translatedAt: "2026-09-13T00:00:00Z",
    });
    expect(map.has("x_post:post2")).toBe(false);
  });
});

describe("upsertChromeTranslation", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it("rejects stale client hashes", async () => {
    execute.mockResolvedValueOnce({
      rows: [{ text: "Body", quoted_snapshot_json: null }],
    });

    await expect(
      upsertChromeTranslation({
        kind: "x_post",
        id: "post1",
        text: "訳文",
        sourceLang: "en",
        sourceHash: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("upserts when the hash matches", async () => {
    const source = "Body";
    const hash = chromeTranslateSourceHashSync(source);
    execute
      .mockResolvedValueOnce({
        rows: [{ text: "Body", quoted_snapshot_json: null }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "saved1" }] });

    const result = await upsertChromeTranslation({
      kind: "x_post",
      id: "post1",
      text: "本文",
      sourceLang: "en",
      sourceHash: hash,
    });

    expect(result.id).toBe("saved1");
    expect(execute).toHaveBeenCalledTimes(3);
  });
});

describe("resolveTranslationSource", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it("returns null when the target row is missing", async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    expect(await resolveTranslationSource("article", "missing")).toBeNull();
  });
});
