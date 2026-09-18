import { createAgentUIStreamResponse } from "ai";
import { connection } from "next/server";
import { pruneAskUiMessages } from "@/lib/ask";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isSameOrigin } from "@/lib/origin";
import { createAskAgent } from "@/server/ai/agents/ask";
import { budget, peekLane } from "@/server/ai/budget";
import { getAskAvailability } from "@/server/ask/availability";
import { saveAskTurn } from "@/server/ask/qa";
import { getAccountContext } from "@/server/x/context";

export const instant = false;
export const maxDuration = 60;

function textFromUiMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const row = message as {
    content?: unknown;
    parts?: Array<{ type?: string; text?: string }>;
  };
  if (typeof row.content === "string") {
    return row.content;
  }
  if (!Array.isArray(row.parts)) {
    return "";
  }
  return row.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}

function lastUserText(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: string } | undefined;
    if (message?.role === "user") {
      return textFromUiMessage(message).trim();
    }
  }
  return "";
}

function lastAssistantText(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: string } | undefined;
    if (message?.role === "assistant") {
      return textFromUiMessage(message).trim();
    }
  }
  return "";
}

function citationIds(messages: unknown[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    const parts = (message as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) {
      continue;
    }
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const row = part as {
        type?: string;
        toolName?: string;
        output?: { items?: Array<{ id?: string }> };
      };
      const isSearch =
        row.toolName === "searchKnowledge" ||
        row.type === "tool-searchKnowledge";
      if (!isSearch) {
        continue;
      }
      for (const item of row.output?.items ?? []) {
        if (item.id && !seen.has(item.id)) {
          seen.add(item.id);
          ids.push(item.id);
        }
      }
    }
  }
  return ids.slice(0, 12);
}

export async function GET(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  return Response.json({ ok: true, ask: await getAskAvailability() });
}

export async function POST(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const availability = await getAskAvailability();
    if (!availability.available) {
      throw new AppError(
        availability.reason?.includes("一時停止")
          ? "FORBIDDEN"
          : availability.reason?.includes("GEMINI")
            ? "FORBIDDEN"
            : "LANE_CAP",
        availability.reason ?? "本日の無料枠がなくなりました",
        { retryable: true, retryAfter: availability.resetAt ?? undefined },
      );
    }
    const body = (await request.json().catch(() => ({}))) as {
      messages?: unknown;
      sessionId?: string;
    };
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const uiMessages = pruneAskUiMessages(incoming);
    const question = lastUserText(uiMessages);
    if (!question) {
      throw new AppError("VALIDATION", "質問を入力してください");
    }
    const ctx = await getAccountContext();
    const peek = await peekLane("bulk");
    const agent = createAskAgent({ ctx, model: peek.model });
    return createAgentUIStreamResponse({
      agent,
      uiMessages,
      onError: (error) => {
        void budget.noteError("bulk", peek.model, error);
        if (error instanceof AppError) {
          return error.message;
        }
        logger.warn({ err: error }, "ask stream error");
        return "回答できませんでした";
      },
      onEnd: async ({ messages, isAborted }) => {
        if (isAborted) {
          return;
        }
        const answer = lastAssistantText(messages);
        if (!answer) {
          return;
        }
        await saveAskTurn({
          sessionId: body.sessionId,
          title: question,
          userText: question,
          assistantText: answer,
          citations: citationIds(messages),
          lane: "bulk",
        });
      },
    });
  } catch (error) {
    const body = toErrorBody(error);
    const status = error instanceof AppError ? error.status : 500;
    return Response.json(body, { status });
  }
}
