import { describe, expect, it } from "vitest";
import {
  isOptionalStatement,
  loadInitSql,
  splitSql,
  toLocalSqlite,
} from "./sql";

describe("sql helpers", () => {
  it("splits statements and keeps vector indexes optional", () => {
    const statements = splitSql(loadInitSql());
    expect(
      statements.some((sql) =>
        sql.includes("CREATE TABLE IF NOT EXISTS settings"),
      ),
    ).toBe(true);
    expect(statements.some((sql) => sql.includes("knowledge_cards"))).toBe(
      true,
    );
    expect(statements.some((sql) => sql.includes("media_blobs"))).toBe(true);
    expect(statements.some((sql) => sql.includes("video_downloads"))).toBe(
      true,
    );
    expect(
      statements.filter((sql) => isOptionalStatement(sql)).length,
    ).toBeGreaterThan(0);
  });

  it("rewrites vector columns for local sqlite", () => {
    expect(toLocalSqlite("embedding F32_BLOB(768)")).toBe("embedding BLOB");
  });
});
