import { describe, expect, it } from "vitest";
import {
  isThumbSidecarFileName,
  parseThumbSidecar,
  serializeThumbSidecar,
  thumbSidecarName,
} from "./video-thumb-sidecar";

describe("video thumb sidecar", () => {
  it("appends the lvl sidecar suffix to the video filename", () => {
    expect(thumbSidecarName("2001_3.mp4")).toBe("2001_3.mp4.lvl.json");
    expect(isThumbSidecarFileName("2001_3.mp4.lvl.json")).toBe(true);
    expect(isThumbSidecarFileName("2001_3.mp4")).toBe(false);
  });

  it("round-trips a seek position and ignores invalid files", () => {
    const raw = serializeThumbSidecar(12.25);
    expect(parseThumbSidecar(raw)).toBe(12.25);
    expect(parseThumbSidecar('{"thumbSeekSeconds": -1}')).toBeUndefined();
    expect(parseThumbSidecar("not-json")).toBeUndefined();
  });
});
