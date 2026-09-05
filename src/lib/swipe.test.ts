import { describe, expect, it } from "vitest";
import {
  resolveSwipeIntent,
  swipeAxis,
  swipeHint,
  swipeOffset,
} from "@/lib/swipe";

describe("swipeAxis", () => {
  it("waits for the lock distance", () => {
    expect(swipeAxis(4, 3)).toBeNull();
    expect(swipeAxis(12, 3)).toBe("x");
    expect(swipeAxis(3, -12)).toBe("y");
  });
});

describe("resolveSwipeIntent", () => {
  it("maps right / left / up past the threshold", () => {
    expect(resolveSwipeIntent(90, 10)).toBe("confirm");
    expect(resolveSwipeIntent(-90, 10)).toBe("archive");
    expect(resolveSwipeIntent(10, -90)).toBe("snooze");
    expect(resolveSwipeIntent(20, -20)).toBeNull();
  });
});

describe("swipeOffset and hint", () => {
  it("locks to one axis and ignores downward drag", () => {
    expect(swipeOffset(40, -30, "x")).toEqual({ x: 40, y: 0 });
    expect(swipeOffset(40, 30, "y")).toEqual({ x: 0, y: 0 });
    expect(swipeOffset(40, -30, "y")).toEqual({ x: 0, y: -30 });
  });

  it("fades the matching hint in", () => {
    expect(swipeHint(40, 0, "x", 80)).toEqual({
      intent: "confirm",
      progress: 0.5,
    });
    expect(swipeHint(-80, 0, "x", 80)).toEqual({
      intent: "archive",
      progress: 1,
    });
    expect(swipeHint(0, -40, "y", 80)).toEqual({
      intent: "snooze",
      progress: 0.5,
    });
  });
});
