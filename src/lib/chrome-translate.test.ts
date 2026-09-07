import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectSourceLanguage,
  htmlLanguage,
  isJapaneseLang,
  looksMostlyJapanese,
  primaryLanguage,
  resolveSourceLanguage,
  shouldOfferTranslate,
  translatableProps,
  translatorLanguage,
} from "./chrome-translate";

const SIMPLIFIED =
  "这是一篇关于人工智能的文章。深度学习模型在自然语言处理领域取得了显著进展。";
const TRADITIONAL =
  "這是一篇關於人工智慧的文章。深度學習模型在自然語言處理領域取得了顯著進展。";
const KOREAN =
  "이것은 인공지능에 관한 기사입니다. 딥러닝 모델이 자연어 처리에서 성과를 냈습니다.";
const JAPANESE = "これは日本語の投稿です。翻訳ボタンは出ません。";

describe("primaryLanguage", () => {
  it("normalizes BCP 47 and drops unknown", () => {
    expect(primaryLanguage("en-US")).toBe("en");
    expect(primaryLanguage("JA")).toBe("ja");
    expect(primaryLanguage("zh-Hant")).toBe("zh");
    expect(primaryLanguage("und")).toBeNull();
    expect(primaryLanguage("")).toBeNull();
  });
});

describe("translatorLanguage", () => {
  it("keeps traditional Chinese and maps simplified variants to zh", () => {
    expect(translatorLanguage("zh-Hant")).toBe("zh-Hant");
    expect(translatorLanguage("zh-TW")).toBe("zh-Hant");
    expect(translatorLanguage("zh-HK")).toBe("zh-Hant");
    expect(translatorLanguage("zh-CN")).toBe("zh");
    expect(translatorLanguage("zh-Hans")).toBe("zh");
    expect(translatorLanguage("zh")).toBe("zh");
    expect(translatorLanguage("en-US")).toBe("en");
    expect(translatorLanguage("und")).toBeNull();
  });
});

describe("looksMostlyJapanese", () => {
  it("uses kana, not Han characters", () => {
    expect(looksMostlyJapanese(JAPANESE)).toBe(true);
    expect(looksMostlyJapanese("人工知能の研究")).toBe(true);
    expect(looksMostlyJapanese(SIMPLIFIED)).toBe(false);
    expect(looksMostlyJapanese(TRADITIONAL)).toBe(false);
    expect(looksMostlyJapanese(KOREAN)).toBe(false);
    expect(looksMostlyJapanese("This is an English bookmark.")).toBe(false);
  });
});

describe("shouldOfferTranslate", () => {
  it("skips Japanese-looking text and offers other scripts", () => {
    expect(isJapaneseLang("ja-JP")).toBe(true);
    expect(shouldOfferTranslate("これは日本語です。", "en")).toBe(false);
    expect(shouldOfferTranslate(JAPANESE, "ja")).toBe(false);
    expect(shouldOfferTranslate("This is an English bookmark.", "en")).toBe(
      true,
    );
    expect(shouldOfferTranslate(SIMPLIFIED, "ja")).toBe(true);
    expect(shouldOfferTranslate(TRADITIONAL, "zh-TW")).toBe(true);
    expect(shouldOfferTranslate(KOREAN, null)).toBe(true);
    expect(
      shouldOfferTranslate(
        "Robotics is the least crowded high-value skill in tech right now.",
        "ja",
      ),
    ).toBe(true);
  });
});

describe("translatableProps", () => {
  it("marks AI Japanese as no-translate and originals as yes", () => {
    expect(translatableProps("en", true)).toEqual({
      lang: "ja",
      translate: "no",
    });
    expect(translatableProps("en-US", false)).toEqual({
      lang: "en",
      translate: "yes",
    });
    expect(translatableProps("zh-Hant", false)).toEqual({
      lang: "zh-Hant",
      translate: "yes",
    });
    expect(translatableProps(null, false)).toEqual({
      translate: "yes",
    });
  });
});

describe("htmlLanguage", () => {
  it("keeps zh-Hant for the HTML lang attribute", () => {
    expect(htmlLanguage("zh-TW")).toBe("zh-Hant");
    expect(htmlLanguage("zh-CN")).toBe("zh");
  });
});

describe("resolveSourceLanguage", () => {
  it("prefers a non-Japanese detector result over a Japanese hint", () => {
    expect(
      resolveSourceLanguage({
        detected: "zh-Hans",
        confidence: 0.9,
        hinted: "ja",
      }),
    ).toBe("zh");
    expect(
      resolveSourceLanguage({
        detected: "zh-Hant",
        confidence: 0.8,
        hinted: "ja",
      }),
    ).toBe("zh-Hant");
  });

  it("uses a non-Japanese hint when detection is Japanese or missing", () => {
    expect(
      resolveSourceLanguage({
        detected: "ja",
        confidence: 0.95,
        hinted: "zh",
      }),
    ).toBe("zh");
    expect(
      resolveSourceLanguage({
        detected: null,
        hinted: "en-US",
      }),
    ).toBe("en");
  });

  it("keeps Japanese when both sides say Japanese", () => {
    expect(
      resolveSourceLanguage({
        detected: "ja",
        confidence: 0.9,
        hinted: "ja-JP",
      }),
    ).toBe("ja");
  });
});

describe("detectSourceLanguage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to a non-Japanese hint when Detector is missing", async () => {
    expect(await detectSourceLanguage("hello", "zh")).toBe("zh");
    expect(await detectSourceLanguage(SIMPLIFIED, "ja")).toBe("ja");
  });

  it("uses Detector even when the hint is Japanese", async () => {
    vi.stubGlobal("LanguageDetector", {
      availability: async () => "available",
      create: async () => ({
        detect: async () => [{ detectedLanguage: "zh-Hans", confidence: 0.92 }],
      }),
    });
    expect(await detectSourceLanguage(SIMPLIFIED, "ja")).toBe("zh");
  });
});
