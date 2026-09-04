import { describe, expect, it } from "vitest";
import { sourceScopeSql } from "./scope";

describe("sourceScopeSql", () => {
  it("filters one account", () => {
    expect(sourceScopeSql("acc-1")).toEqual({
      clause: "x_account_id = ?",
      args: ["acc-1"],
    });
  });

  it("matches nothing when no account is selected", () => {
    expect(sourceScopeSql(null)).toEqual({ clause: "1 = 0", args: [] });
  });

  it("qualifies the column with an alias", () => {
    expect(sourceScopeSql("acc-1", "s")).toEqual({
      clause: "s.x_account_id = ?",
      args: ["acc-1"],
    });
  });
});
