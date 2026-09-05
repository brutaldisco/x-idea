import { describe, expect, it } from "vitest";
import {
  formatCardDate,
  nextMidnightPacific,
  pacificDay,
  toSqliteUtc,
} from "./datetime";

describe("formatCardDate", () => {
  it("formats ISO dates in Asia/Tokyo", () => {
    expect(formatCardDate("2026-09-04T15:00:00.000Z")).toBe("2026/9/5");
    expect(formatCardDate(null)).toBeNull();
  });
});

describe("pacificDay", () => {
  it("uses PDT midnight (UTC-7) in September", () => {
    expect(pacificDay(new Date("2026-09-06T06:59:59.000Z"))).toBe("2026-09-05");
    expect(pacificDay(new Date("2026-09-06T07:00:00.000Z"))).toBe("2026-09-06");
  });

  it("uses PST midnight (UTC-8) in January", () => {
    expect(pacificDay(new Date("2026-01-15T07:59:59.000Z"))).toBe("2026-01-14");
    expect(pacificDay(new Date("2026-01-15T08:00:00.000Z"))).toBe("2026-01-15");
  });
});

describe("nextMidnightPacific", () => {
  it("lands on the next PT date boundary", () => {
    const before = new Date("2026-09-06T06:59:59.000Z");
    const next = nextMidnightPacific(before);
    expect(pacificDay(next)).toBe("2026-09-06");
    expect(next.toISOString()).toBe("2026-09-06T07:00:00.000Z");
  });
});

describe("toSqliteUtc", () => {
  it("drops the T and milliseconds", () => {
    expect(toSqliteUtc(new Date("2026-09-06T07:00:00.000Z"))).toBe(
      "2026-09-06 07:00:00",
    );
  });
});
