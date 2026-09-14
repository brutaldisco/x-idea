import { describe, expect, it } from "vitest";
import { payloadCoverChecked, shouldHydrateXArticle } from "./x-article";

describe("shouldHydrateXArticle", () => {
  it("fetches when the body is still missing", () => {
    expect(
      shouldHydrateXArticle({
        hasBody: false,
        needsCover: false,
        coverChecked: true,
      }),
    ).toBe(true);
  });

  it("retries an empty thumbnail until the API has been checked", () => {
    expect(
      shouldHydrateXArticle({
        hasBody: true,
        needsCover: true,
        coverChecked: false,
      }),
    ).toBe(true);
    expect(
      shouldHydrateXArticle({
        hasBody: true,
        needsCover: true,
        coverChecked: true,
      }),
    ).toBe(false);
  });

  it("skips when the body is present and a cover is not needed", () => {
    expect(
      shouldHydrateXArticle({
        hasBody: true,
        needsCover: false,
        coverChecked: false,
      }),
    ).toBe(false);
  });

  it("retries when saved body still has t.co links", () => {
    expect(
      shouldHydrateXArticle({
        hasBody: true,
        needsCover: false,
        coverChecked: true,
        hasShortLinks: true,
      }),
    ).toBe(true);
  });
});

describe("payloadCoverChecked", () => {
  it("reads the cover-checked flag from a stub payload", () => {
    expect(payloadCoverChecked('{"article_hydrated":true}')).toBe(false);
    expect(
      payloadCoverChecked(
        '{"article_hydrated":true,"article_cover_checked":true}',
      ),
    ).toBe(true);
  });
});
