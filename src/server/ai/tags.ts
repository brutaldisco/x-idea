import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { normalizeTagName } from "@/server/ai/enrich-post";

export async function loadTagContext(): Promise<{
  frequent: string[];
  aliases: Map<string, string>;
}> {
  const client = getClient();
  const [tags, aliases] = await Promise.all([
    client.execute(
      "SELECT name FROM tags ORDER BY usage_count DESC, name LIMIT 100",
    ),
    client.execute("SELECT alias, tag_id FROM tag_aliases LIMIT 500"),
  ]);
  const tagNames = new Map<string, string>();
  const nameRows = await client.execute("SELECT id, name FROM tags LIMIT 500");
  for (const row of nameRows.rows) {
    tagNames.set(String(row.id), String(row.name));
  }
  const aliasMap = new Map<string, string>();
  for (const row of aliases.rows) {
    const canonical = tagNames.get(String(row.tag_id));
    if (canonical) {
      aliasMap.set(normalizeTagName(String(row.alias)), canonical);
    }
  }
  return {
    frequent: tags.rows.map((row) => String(row.name)),
    aliases: aliasMap,
  };
}

export async function attachTags(
  sourceId: string,
  names: string[],
  addedBy: "ai" | "user" = "ai",
): Promise<void> {
  const client = getClient();
  await client.execute({
    sql:
      addedBy === "user"
        ? "DELETE FROM source_tags WHERE source_id = ?"
        : "DELETE FROM source_tags WHERE source_id = ? AND added_by = 'ai'",
    args: [sourceId],
  });
  for (const name of names) {
    const existing = await client.execute({
      sql: "SELECT id FROM tags WHERE name = ? LIMIT 1",
      args: [name],
    });
    let tagId = existing.rows[0]?.id ? String(existing.rows[0].id) : null;
    if (!tagId) {
      tagId = newId();
      await client.execute({
        sql: "INSERT INTO tags (id, name, usage_count, created_at) VALUES (?, ?, 1, datetime('now'))",
        args: [tagId, name],
      });
    } else {
      await client.execute({
        sql: "UPDATE tags SET usage_count = usage_count + 1 WHERE id = ?",
        args: [tagId],
      });
    }
    await client.execute({
      sql: `INSERT OR IGNORE INTO source_tags (source_id, tag_id, added_by)
            VALUES (?, ?, ?)`,
      args: [sourceId, tagId, addedBy],
    });
  }
}
