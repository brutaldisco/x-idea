import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import type { Lane } from "@/server/ai/lanes";

export async function saveAskTurn(input: {
  sessionId?: string | null;
  title: string;
  userText: string;
  assistantText: string;
  citations: string[];
  lane: Lane;
}): Promise<string | null> {
  if (!isDbConfigured()) {
    return input.sessionId ?? null;
  }
  try {
    await ensureSchema();
    const sessionId = input.sessionId?.trim() || newId();
    const existing = await getClient().execute({
      sql: "SELECT id FROM qa_sessions WHERE id = ? LIMIT 1",
      args: [sessionId],
    });
    if (!existing.rows[0]) {
      await getClient().execute({
        sql: `INSERT INTO qa_sessions (id, title, filters_json, created_at)
              VALUES (?, ?, NULL, datetime('now'))`,
        args: [sessionId, input.title.slice(0, 80)],
      });
    }
    await getClient().execute({
      sql: `INSERT INTO qa_messages
              (id, session_id, role, parts_json, citations_json, lane, created_at)
            VALUES (?, ?, 'user', ?, NULL, ?, datetime('now'))`,
      args: [
        newId(),
        sessionId,
        JSON.stringify([{ type: "text", text: input.userText }]),
        input.lane,
      ],
    });
    await getClient().execute({
      sql: `INSERT INTO qa_messages
              (id, session_id, role, parts_json, citations_json, lane, created_at)
            VALUES (?, ?, 'assistant', ?, ?, ?, datetime('now'))`,
      args: [
        newId(),
        sessionId,
        JSON.stringify([{ type: "text", text: input.assistantText }]),
        input.citations.length > 0 ? JSON.stringify(input.citations) : null,
        input.lane,
      ],
    });
    return sessionId;
  } catch (error) {
    logger.warn({ err: error }, "ask qa persist failed");
    return input.sessionId ?? null;
  }
}
