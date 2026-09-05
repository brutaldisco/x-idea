import { describe, expect, it } from "vitest";
import { actionFail, actionOk } from "@/lib/action-result";
import { AppError } from "@/lib/errors";

describe("actionResult", () => {
  it("wraps success and AppError", () => {
    expect(actionOk({ id: "s1" })).toEqual({ ok: true, data: { id: "s1" } });
    expect(
      actionFail(new AppError("NOT_FOUND", "Source がありません")),
    ).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Source がありません" },
    });
  });
});
