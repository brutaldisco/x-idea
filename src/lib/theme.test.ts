import { describe, expect, it } from "vitest";
import { isThemeMode, THEME_STORAGE_KEY } from "./theme";

describe("theme", () => {
  it("recognizes light and dark only", () => {
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("system")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  it("uses a stable storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("x-idea-theme");
  });
});
