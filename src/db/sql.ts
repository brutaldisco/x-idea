import { readFileSync } from "node:fs";
import { join } from "node:path";

const OPTIONAL = /libsql_vector_idx|F32_BLOB|sources_fts|tokenize = 'trigram'/i;

export function splitSql(sql: string): string[] {
  return sql
    .split(";")
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

export function loadInitSql(): string {
  return readFileSync(join(process.cwd(), "drizzle/0000_init.sql"), "utf8");
}

export function isOptionalStatement(sql: string): boolean {
  return OPTIONAL.test(sql);
}

export function toLocalSqlite(sql: string): string {
  return sql.replaceAll(/F32_BLOB\(\d+\)/g, "BLOB");
}
