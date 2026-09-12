import { describe, expect, it } from "vitest";
import { shouldFetchMediaBlob } from "./download-policy";

describe("shouldFetchMediaBlob", () => {
  it("skips when a blob already exists", () => {
    expect(shouldFetchMediaBlob({ hasBlob: true, status: "ready" })).toBe(
      false,
    );
    expect(shouldFetchMediaBlob({ hasBlob: true, status: "pending" })).toBe(
      false,
    );
  });

  it("refetches a missing blob even if status is ready or downloading", () => {
    expect(shouldFetchMediaBlob({ hasBlob: false, status: "ready" })).toBe(
      true,
    );
    expect(
      shouldFetchMediaBlob({ hasBlob: false, status: "downloading" }),
    ).toBe(true);
    expect(shouldFetchMediaBlob({ hasBlob: false, status: "pending" })).toBe(
      true,
    );
  });

  it("leaves awaiting_confirm and skipped alone unless forced", () => {
    expect(
      shouldFetchMediaBlob({ hasBlob: false, status: "awaiting_confirm" }),
    ).toBe(false);
    expect(shouldFetchMediaBlob({ hasBlob: false, status: "skipped" })).toBe(
      false,
    );
    expect(
      shouldFetchMediaBlob({
        hasBlob: false,
        status: "skipped",
        force: true,
      }),
    ).toBe(true);
  });
});
