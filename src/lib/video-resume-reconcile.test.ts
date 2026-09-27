import { describe, expect, it } from "vitest";
import {
  combinedLocalBytes,
  effectiveSavedProgress,
  hasMp4FtypAtStart,
  reconcileLocalVideoState,
} from "./video-resume-reconcile";

const FTYP = new Uint8Array([
  0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);

describe("combinedLocalBytes", () => {
  it("sums main and sidecar sizes", () => {
    expect(combinedLocalBytes(100, 50)).toBe(150);
  });
});

describe("effectiveSavedProgress", () => {
  it("prefers disk when larger than saved progress", () => {
    expect(effectiveSavedProgress(1_000, 2_000, 500)).toBe(2_500);
  });
});

describe("hasMp4FtypAtStart", () => {
  it("detects ftyp at offset 4", () => {
    expect(hasMp4FtypAtStart(FTYP)).toBe(true);
    expect(hasMp4FtypAtStart(new Uint8Array(4))).toBe(false);
  });
});

describe("reconcileLocalVideoState", () => {
  const total = 3_411_695_045;
  const main = 1_350_565_888;
  const part = 1_694_498_816;
  const remaining = total - main;

  it("complete-only when main matches total", () => {
    const state = reconcileLocalVideoState({
      mainSize: total,
      partSize: 0,
      savedProgress: total,
      trustedTotal: total,
      softTotal: null,
      mainHasFtyp: true,
    });
    expect(state.phase).toBe("complete-only");
    expect(state.received).toBe(total);
  });

  it("merge-only when tail is full in sidecar", () => {
    const state = reconcileLocalVideoState({
      mainSize: main,
      partSize: remaining,
      savedProgress: main + remaining - 1,
      trustedTotal: total,
      softTotal: total,
      mainHasFtyp: true,
    });
    expect(state.phase).toBe("merge-only");
  });

  it("fetch-tail when sidecar is partial", () => {
    const state = reconcileLocalVideoState({
      mainSize: main,
      partSize: part,
      savedProgress: main + part,
      trustedTotal: total,
      softTotal: total,
      mainHasFtyp: true,
    });
    expect(state.phase).toBe("fetch-tail");
    expect(state.remainingTail).toBeGreaterThan(0);
  });

  it("fresh when empty", () => {
    const state = reconcileLocalVideoState({
      mainSize: 0,
      partSize: 0,
      savedProgress: 0,
      trustedTotal: null,
      softTotal: 10_000,
      mainHasFtyp: false,
    });
    expect(state.phase).toBe("fresh");
  });
});
