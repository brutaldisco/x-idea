import { describe, expect, it } from "vitest";
import {
  formatGoneSweepCursor,
  parseGoneSweepCursor,
  shouldRestartGoneSweep,
} from "./gone-sweep";

describe("gone sweep cursor", () => {
  it("round-trips saved_at and source id", () => {
    const raw = formatGoneSweepCursor("2026-09-08 13:48:46", "01ABC");
    expect(parseGoneSweepCursor(raw)).toEqual({
      savedAt: "2026-09-08 13:48:46",
      sourceId: "01ABC",
    });
  });

  it("rejects empty or malformed values", () => {
    expect(parseGoneSweepCursor(null)).toBeNull();
    expect(parseGoneSweepCursor("no-tab")).toBeNull();
    expect(parseGoneSweepCursor("\tonly-id")).toBeNull();
  });

  it("restarts from the beginning after a full pass", () => {
    expect(
      shouldRestartGoneSweep({ savedAt: "2026-09-11", sourceId: "01ABC" }, 0),
    ).toBe(true);
    expect(shouldRestartGoneSweep(null, 0)).toBe(false);
    expect(
      shouldRestartGoneSweep({ savedAt: "2026-09-11", sourceId: "01ABC" }, 10),
    ).toBe(false);
  });
});
