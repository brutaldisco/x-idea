import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  it("meets Chrome install fields", () => {
    const data = manifest();
    expect(data.name || data.short_name).toBeTruthy();
    expect(data.start_url).toBe("/today");
    expect(data.display).toBe("standalone");
    expect(data.prefer_related_applications).not.toBe(true);
    const sizes = new Set(data.icons?.map((icon) => icon.sizes));
    expect(sizes.has("192x192")).toBe(true);
    expect(sizes.has("512x512")).toBe(true);
    expect(data.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
    expect(data.share_target?.action).toBe("/capture");
  });
});
