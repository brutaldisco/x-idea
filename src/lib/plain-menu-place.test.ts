import { describe, expect, it } from "vitest";
import {
  estimatePlainMenuHeight,
  PLAIN_MENU_MAX_HEIGHT,
  placePlainMenu,
} from "./plain-menu-place";

describe("estimatePlainMenuHeight", () => {
  it("caps at the menu max height", () => {
    expect(estimatePlainMenuHeight(20)).toBe(PLAIN_MENU_MAX_HEIGHT);
  });

  it("grows with option count", () => {
    expect(estimatePlainMenuHeight(2)).toBeLessThan(estimatePlainMenuHeight(8));
  });
});

describe("placePlainMenu", () => {
  it("opens upward when the button sits above the tab bar", () => {
    const placed = placePlainMenu({
      buttonTop: 442,
      buttonBottom: 456,
      buttonLeft: 457,
      viewportWidth: 768,
      viewportHeight: 700,
      menuHeight: 256,
    });
    expect(placed.top).toBeLessThan(442);
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(442);
    expect(placed.maxHeight).toBeGreaterThan(48);
  });

  it("opens downward when there is room below", () => {
    const placed = placePlainMenu({
      buttonTop: 80,
      buttonBottom: 96,
      buttonLeft: 24,
      viewportWidth: 768,
      viewportHeight: 800,
      menuHeight: 160,
    });
    expect(placed.top).toBe(100);
    expect(placed.maxHeight).toBe(160);
  });

  it("shrinks to the remaining space instead of leaving the viewport", () => {
    const placed = placePlainMenu({
      buttonTop: 360,
      buttonBottom: 376,
      buttonLeft: 24,
      viewportWidth: 390,
      viewportHeight: 640,
      menuHeight: 256,
    });
    expect(placed.top).toBeGreaterThanOrEqual(8);
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(640 - 72);
    expect(placed.maxHeight).toBeGreaterThanOrEqual(48);
  });

  it("keeps the menu inside the horizontal viewport", () => {
    const placed = placePlainMenu({
      buttonTop: 80,
      buttonBottom: 96,
      buttonLeft: 700,
      viewportWidth: 768,
      viewportHeight: 800,
      menuHeight: 80,
    });
    expect(placed.left + 144).toBeLessThanOrEqual(760);
    expect(placed.left).toBeGreaterThanOrEqual(8);
  });
});
