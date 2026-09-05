import { describe, expect, it } from "vitest";
import { encodePhotoWebp } from "./webp";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("encodePhotoWebp", () => {
  it("converts a PNG buffer to WebP", async () => {
    const out = await encodePhotoWebp(PNG_1X1);
    expect(out.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(out.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });
});
