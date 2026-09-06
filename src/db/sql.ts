import { readFileSync } from "node:fs";
import { join } from "node:path";

const OPTIONAL = /libsql_vector_idx|F32_BLOB|sources_fts|tokenize = 'trigram'/i;
const IDEMPOTENT_SKIP = /duplicate column name|no such column/i;

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

const MIGRATION_FILES = [
  "0000_init.sql",
  "0001_multi_account.sql",
  "0002_usage_credits.sql",
  "0003_media_context.sql",
  "0004_sync_controls.sql",
  "0005_video_library.sql",
  "0006_sync_interval.sql",
  "0007_video_save_folder.sql",
  "0008_account_taxonomy.sql",
  "0009_dismissed_bookmarks.sql",
];

export function loadInitSql(): string {
  return MIGRATION_FILES.map((file) =>
    readFileSync(join(process.cwd(), "drizzle", file), "utf8"),
  ).join(";\n");
}

export function isOptionalStatement(sql: string): boolean {
  return OPTIONAL.test(sql);
}

export function isIdempotentSkip(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return IDEMPOTENT_SKIP.test(message);
}

export function toLocalSqlite(sql: string): string {
  return sql.replaceAll(/F32_BLOB\(\d+\)/g, "BLOB");
}
