import { describe, expect, it } from "vitest";
import { cronDue } from "./cron";

describe("cronDue", () => {
  it("matches every 30 minutes", () => {
    const at = new Date(Date.UTC(2026, 8, 4, 7, 30, 0));
    expect(cronDue("*/30 * * * *", at)).toBe(true);
    expect(
      cronDue("*/30 * * * *", new Date(Date.UTC(2026, 8, 4, 7, 15, 0))),
    ).toBe(false);
  });

  it("matches a specific hour", () => {
    const at = new Date(Date.UTC(2026, 8, 4, 7, 0, 0));
    expect(cronDue("0 7 * * *", at)).toBe(true);
    expect(cronDue("0 8 * * *", at)).toBe(false);
  });

  it("matches Sunday weekly", () => {
    const sunday = new Date(Date.UTC(2026, 8, 6, 8, 0, 0));
    expect(sunday.getUTCDay()).toBe(0);
    expect(cronDue("0 8 * * 0", sunday)).toBe(true);
  });

  it("evaluates Asia/Tokyo wall clock", () => {
    const jst7 = new Date(Date.UTC(2026, 8, 4, 22, 0, 0));
    expect(cronDue("0 7 * * *", jst7, "Asia/Tokyo")).toBe(true);
    expect(cronDue("0 7 * * *", jst7, "UTC")).toBe(false);
  });
});
