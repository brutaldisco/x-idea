import { describe, expect, it } from "vitest";
import {
  isJapaneseLang,
  looksMostlyJapanese,
  primaryLanguage,
  shouldOfferTranslate,
  translatableProps,
} from "./chrome-translate";

describe("primaryLanguage", () => {
  it("normalizes BCP 47 and drops unknown", () => {
    expect(primaryLanguage("en-US")).toBe("en");
    expect(primaryLanguage("JA")).toBe("ja");
    expect(primaryLanguage("und")).toBeNull();
    expect(primaryLanguage("")).toBeNull();
  });
});

describe("shouldOfferTranslate", () => {
  it("skips Japanese posts and Japanese-looking text", () => {
    expect(isJapaneseLang("ja-JP")).toBe(true);
    expect(looksMostlyJapanese("これは日本語の投稿です。")).toBe(true);
    expect(shouldOfferTranslate("これは日本語です。", "en")).toBe(false);
    expect(shouldOfferTranslate("This is an English bookmark.", "en")).toBe(
      true,
    );
    expect(shouldOfferTranslate("Hi", "ja")).toBe(false);
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
  });
});
