import { describe, expect, it } from "vitest";
import { nextMidnightPacific, pacificDay } from "@/lib/datetime";
import { AppError } from "@/lib/errors";
import {
  collectQuotaIds,
  cooldownFrom429,
  decideCall,
  isLaneBudgetError,
  isPerDayQuota,
  laneRetryAt,
  toLaneError,
} from "@/server/ai/budget";
import {
  DEFAULT_CAPS,
  parseLaneCaps,
  parseLaneModels,
  thinkingLevel,
} from "@/server/ai/lanes";

describe("lane settings", () => {
  it("falls back to defaults and accepts overrides", () => {
    expect(parseLaneCaps("not-json")).toEqual(DEFAULT_CAPS);
    expect(parseLaneCaps({ bulk: 10, quality: 2, embed: 50 })).toEqual({
      bulk: 10,
      quality: 2,
      embed: 50,
    });
    expect(parseLaneModels({ bulk: " custom-lite " }).bulk).toBe("custom-lite");
  });

  it("maps thinkingLevel by lane and kind", () => {
    expect(thinkingLevel("bulk", "classify")).toBe("minimal");
    expect(thinkingLevel("bulk", "summarize")).toBe("low");
    expect(thinkingLevel("quality")).toBe("medium");
    expect(thinkingLevel("embed")).toBe("low");
  });
});

describe("decideCall", () => {
  const now = new Date("2026-09-06T06:30:00.000Z");

  it("blocks when the daily cap is reached", () => {
    const decision = decideCall({
      now,
      used: 400,
      cap: 400,
      paused: false,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok && decision.code === "LANE_CAP") {
      expect(decision.retryAfter.toISOString()).toBe(
        nextMidnightPacific(now).toISOString(),
      );
    } else {
      expect.fail("expected LANE_CAP");
    }
  });

  it("blocks during cooldown before checking the cap", () => {
    const until = new Date(now.getTime() + 90_000).toISOString();
    const decision = decideCall({
      now,
      used: 0,
      cap: 400,
      cooldownUntil: until,
      paused: false,
    });
    expect(decision).toEqual({
      ok: false,
      code: "LANE_COOLDOWN",
      retryAfter: new Date(until),
    });
  });

  it("resets the day key at Pacific midnight", () => {
    const before = new Date("2026-09-06T06:59:59.000Z");
    const after = new Date("2026-09-06T07:00:00.000Z");
    const usedByDay: Record<string, number> = {
      "2026-09-05": 400,
      "2026-09-06": 0,
    };
    expect(pacificDay(before)).toBe("2026-09-05");
    expect(pacificDay(after)).toBe("2026-09-06");
    expect(
      decideCall({
        now: before,
        used: usedByDay[pacificDay(before)] ?? 0,
        cap: 400,
        paused: false,
      }).ok,
    ).toBe(false);
    expect(
      decideCall({
        now: after,
        used: usedByDay[pacificDay(after)] ?? 0,
        cap: 400,
        paused: false,
      }).ok,
    ).toBe(true);
  });

  it("clears a PerDay cooldown after the PT date rolls over", () => {
    const before = new Date("2026-09-06T06:59:59.000Z");
    const after = new Date("2026-09-06T07:00:00.000Z");
    const until = nextMidnightPacific(before).toISOString();
    expect(
      decideCall({
        now: before,
        used: 0,
        cap: 400,
        cooldownUntil: until,
        paused: false,
      }).ok,
    ).toBe(false);
    expect(
      decideCall({
        now: after,
        used: 0,
        cap: 400,
        cooldownUntil: until,
        paused: false,
      }).ok,
    ).toBe(true);
  });

  it("pauses all lanes without treating it as a cap", () => {
    const decision = decideCall({
      now,
      used: 0,
      cap: 400,
      paused: true,
    });
    expect(decision).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "AI は一時停止中です",
    });
  });
});

describe("429 cooldown", () => {
  const now = new Date("2026-09-06T01:00:00.000Z");

  it("parses quotaId from nested Gemini details", () => {
    const error = {
      statusCode: 429,
      responseBody: JSON.stringify({
        error: {
          details: [
            {
              violations: [
                {
                  quotaId: "GenerateRequestsPerDayPerProjectPerModel",
                  quotaMetric:
                    "generativelanguage.googleapis.com/generate_content_requests",
                },
              ],
            },
          ],
        },
      }),
    };
    const ids = collectQuotaIds(error);
    expect(isPerDayQuota(ids)).toBe(true);
    expect(cooldownFrom429(error, now, 0).toISOString()).toBe(
      nextMidnightPacific(now).toISOString(),
    );
  });

  it("uses 60s * (1 + jitter) for non-daily 429", () => {
    const error = {
      status: 429,
      details: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel" }],
    };
    expect(cooldownFrom429(error, now, 0.5).getTime()).toBe(
      now.getTime() + 90_000,
    );
  });
});

describe("lane errors", () => {
  it("marks cap and cooldown as retryable budget errors", () => {
    const cap = toLaneError({
      ok: false,
      code: "LANE_CAP",
      retryAfter: new Date("2026-09-06T07:00:00.000Z"),
    });
    expect(isLaneBudgetError(cap)).toBe(true);
    expect(cap.retryable).toBe(true);
    expect(laneRetryAt(cap).toISOString()).toBe("2026-09-06T07:00:00.000Z");
    expect(isLaneBudgetError(new AppError("FORBIDDEN", "no"))).toBe(false);
  });
});
