import { describe, expect, it } from "vitest";
import { companionAllowedOrigin, isSafeRelativeMediaPath } from "./companion";

describe("companionAllowedOrigin", () => {
  it("allows production and localhost", () => {
    expect(companionAllowedOrigin("https://x-idea.vercel.app")).toBe(
      "https://x-idea.vercel.app",
    );
    expect(companionAllowedOrigin("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
    expect(companionAllowedOrigin("https://evil.example")).toBeNull();
  });
});

describe("isSafeRelativeMediaPath", () => {
  it("rejects traversal", () => {
    expect(isSafeRelativeMediaPath("acc/1/a.webp")).toBe(true);
    expect(isSafeRelativeMediaPath("../secret")).toBe(false);
    expect(isSafeRelativeMediaPath("/etc/passwd")).toBe(false);
  });
});
