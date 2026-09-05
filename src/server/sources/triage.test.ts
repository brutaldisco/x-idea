import { describe, expect, it } from "vitest";
import {
  canBulkConfirm,
  feedbackDiffs,
  inputDigest,
  parseCategoryCandidates,
  resolveConfirmCategory,
  snoozeUntilSql,
} from "@/server/sources/triage";

const allowed = new Set(["cat_ai", "cat_thought"]);

describe("parseCategoryCandidates", () => {
  it("keeps up to 3 valid rows", () => {
    expect(
      parseCategoryCandidates(
        JSON.stringify([
          { category_id: "cat_ai", confidence: 0.7 },
          { category_id: "cat_thought", confidence: 0.4 },
          { category_id: "x", confidence: 0.2 },
          { category_id: "y", confidence: 0.1 },
        ]),
      ),
    ).toEqual([
      { category_id: "cat_ai", confidence: 0.7 },
      { category_id: "cat_thought", confidence: 0.4 },
      { category_id: "x", confidence: 0.2 },
    ]);
  });
});

describe("resolveConfirmCategory", () => {
  it("prefers the requested id, then current, then first candidate", () => {
    const candidates = [
      { category_id: "cat_thought", confidence: 0.6 },
      { category_id: "cat_ai", confidence: 0.5 },
    ];
    expect(
      resolveConfirmCategory({
        requestedId: "cat_ai",
        currentId: "cat_thought",
        currentConfidence: 0.6,
        candidates,
        allowedIds: allowed,
      }),
    ).toEqual({ categoryId: "cat_ai", confidence: 1 });
    expect(
      resolveConfirmCategory({
        currentId: "cat_thought",
        currentConfidence: 0.6,
        candidates,
        allowedIds: allowed,
      }),
    ).toEqual({ categoryId: "cat_thought", confidence: 0.6 });
    expect(
      resolveConfirmCategory({
        candidates,
        allowedIds: allowed,
      }),
    ).toEqual({ categoryId: "cat_thought", confidence: 0.6 });
    expect(
      resolveConfirmCategory({
        requestedId: "missing",
        candidates: [],
        allowedIds: allowed,
      }),
    ).toEqual({ categoryId: null, confidence: null });
  });
});

describe("bulk and feedback helpers", () => {
  it("applies the confidence floor", () => {
    expect(canBulkConfirm(0.7, 0.7)).toBe(true);
    expect(canBulkConfirm(0.69, 0.7)).toBe(false);
    expect(canBulkConfirm(null, 0.7)).toBe(false);
  });

  it("records only user-changed fields", () => {
    expect(
      feedbackDiffs({
        aiCategoryId: "cat_ai",
        userCategoryId: "cat_thought",
        aiInfoType: "idea",
        userInfoType: "idea",
        aiTags: ["llm"],
        userTags: [],
      }),
    ).toEqual([{ field: "category_id", ai: "cat_ai", user: "cat_thought" }]);
  });

  it("builds a short digest", () => {
    expect(inputDigest("本文", "記事")).toBe("記事\n本文");
    expect(inputDigest("あ".repeat(400)).length).toBe(300);
  });

  it("snoozes until the next Tokyo midnight", () => {
    const until = snoozeUntilSql(new Date("2026-09-06T10:00:00.000Z"));
    expect(until).toBe("2026-09-06 15:00:00");
  });
});
