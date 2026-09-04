import { describe, expect, it } from "vitest";
import {
  estimateCostUsd,
  isLowRemaining,
  parseCreditBalance,
  parseTweetUsageDays,
  remainingCredits,
  remainingRatio,
} from "./estimate";

describe("estimateCostUsd", () => {
  it("uses Owned Reads $0.001", () => {
    expect(estimateCostUsd(1500)).toBe(1.5);
  });
});

describe("remainingCredits", () => {
  it("prefers the live X balance", () => {
    expect(
      remainingCredits({
        liveRemainingUsd: 8.25,
        purchasedUsd: 10,
        snapshotRemainingUsd: 9,
        usedSinceSnapshotUsd: 1,
        lifetimeUsedUsd: 2,
      }),
    ).toEqual({ remainingUsd: 8.25, source: "live" });
  });

  it("subtracts usage after a console snapshot", () => {
    expect(
      remainingCredits({
        liveRemainingUsd: null,
        purchasedUsd: 10,
        snapshotRemainingUsd: 9,
        usedSinceSnapshotUsd: 1.2,
        lifetimeUsedUsd: 4,
      }),
    ).toEqual({ remainingUsd: 7.8, source: "snapshot" });
  });

  it("falls back to purchased minus lifetime use", () => {
    expect(
      remainingCredits({
        liveRemainingUsd: null,
        purchasedUsd: 10,
        snapshotRemainingUsd: null,
        usedSinceSnapshotUsd: 0,
        lifetimeUsedUsd: 1.5,
      }),
    ).toEqual({ remainingUsd: 8.5, source: "purchased" });
  });

  it("is unknown until a purchase is recorded", () => {
    expect(
      remainingCredits({
        liveRemainingUsd: null,
        purchasedUsd: 0,
        snapshotRemainingUsd: null,
        usedSinceSnapshotUsd: 0,
        lifetimeUsedUsd: 0.3,
      }),
    ).toEqual({ remainingUsd: null, source: "unknown" });
  });
});

describe("remainingRatio / low", () => {
  it("uses purchased as capacity", () => {
    expect(remainingRatio(8, 10, 2)).toBe(0.8);
  });

  it("flags two dollars or less as low", () => {
    expect(isLowRemaining(2)).toBe(true);
    expect(isLowRemaining(2.01)).toBe(false);
    expect(isLowRemaining(null)).toBe(false);
  });
});

describe("parseCreditBalance", () => {
  it("reads nested credit_balance.amount", () => {
    expect(
      parseCreditBalance({
        data: { credit_balance: { amount: "9.50", currency: "USD" } },
      }),
    ).toBe(9.5);
  });

  it("reads a flat balance number", () => {
    expect(parseCreditBalance({ data: { balance: 4 } })).toBe(4);
  });
});

describe("parseTweetUsageDays", () => {
  it("sums tweets_consumed per day", () => {
    expect(
      parseTweetUsageDays({
        data: {
          daily_project_usage: [
            {
              date: "2026-09-04",
              usage: [{ app_id: "1", tweets_consumed: 12 }],
            },
            { date: "2026-09-05", tweets_consumed: 3 },
          ],
        },
      }),
    ).toEqual([
      { date: "2026-09-04", tweets: 12 },
      { date: "2026-09-05", tweets: 3 },
    ]);
  });
});
