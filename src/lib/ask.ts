import type { SourceListItem } from "@/server/sources/query";

export const ASK_DEFAULT_K = 8;
export const ASK_MAX_K = 12;
export const ASK_HISTORY_MAX = 8;

export type AskAvailability = {
  available: boolean;
  remaining: number;
  cap: number;
  reason: string | null;
  resetAt: string | null;
  lane: "bulk";
};

export type AskChatRole = "user" | "assistant";

export type AskChatMessage = {
  id: string;
  role: AskChatRole;
  text: string;
  sources: SourceListItem[];
};

export type AskStreamState = {
  text: string;
  sources: SourceListItem[];
  error: string | null;
};

export function clampAskSearchK(value?: number | null): number {
  if (value == null || !Number.isFinite(value)) {
    return ASK_DEFAULT_K;
  }
  return Math.min(ASK_MAX_K, Math.max(1, Math.round(value)));
}

export function emptyAskAvailability(reason: string, cap = 0): AskAvailability {
  return {
    available: false,
    remaining: 0,
    cap,
    reason,
    resetAt: null,
    lane: "bulk",
  };
}

export function decideAskAvailability(input: {
  mockExternal: boolean;
  hasKey: boolean;
  paused: boolean;
  used: number;
  cap: number;
  cooldownUntil?: string | null;
  now?: Date;
}): AskAvailability {
  const now = input.now ?? new Date();
  if (input.mockExternal) {
    return emptyAskAvailability("モック環境では AI に聞けません", input.cap);
  }
  if (!input.hasKey) {
    return emptyAskAvailability("GEMINI_API_KEY がありません", input.cap);
  }
  if (input.paused) {
    return emptyAskAvailability("AI は一時停止中です", input.cap);
  }
  const remaining = Math.max(0, input.cap - input.used);
  const cooldownAt = input.cooldownUntil
    ? Date.parse(input.cooldownUntil)
    : Number.NaN;
  if (Number.isFinite(cooldownAt) && cooldownAt > now.getTime()) {
    return {
      available: false,
      remaining,
      cap: input.cap,
      reason: "無料枠がクールダウン中です。しばらくしてからやり直してください",
      resetAt: new Date(cooldownAt).toISOString(),
      lane: "bulk",
    };
  }
  if (remaining <= 0) {
    return {
      available: false,
      remaining: 0,
      cap: input.cap,
      reason: "本日の無料枠がなくなりました",
      resetAt: null,
      lane: "bulk",
    };
  }
  return {
    available: true,
    remaining,
    cap: input.cap,
    reason: null,
    resetAt: null,
    lane: "bulk",
  };
}

export function parseAskFollowUps(text: string): string[] {
  const match = text.match(/^##\s*次の質問\s*$/m);
  if (!match || match.index == null) {
    return [];
  }
  const rest = text.slice(match.index + match[0].length);
  return rest
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function splitAskAnswer(text: string): {
  body: string;
  followUps: string[];
} {
  const followUps = parseAskFollowUps(text);
  const match = text.match(/^##\s*次の質問\s*$/m);
  const body =
    match && match.index != null ? text.slice(0, match.index).trimEnd() : text;
  return { body, followUps };
}

export function askSourcesFromToolOutput(output: unknown): SourceListItem[] {
  if (!output || typeof output !== "object") {
    return [];
  }
  const items = (output as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter((item): item is SourceListItem => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return typeof (item as { id?: unknown }).id === "string";
  });
}

export function applyAskUiChunk(
  state: AskStreamState,
  chunk: unknown,
  toolNames: Map<string, string>,
): AskStreamState {
  if (!chunk || typeof chunk !== "object") {
    return state;
  }
  const row = chunk as {
    type?: string;
    delta?: string;
    errorText?: string;
    toolCallId?: string;
    toolName?: string;
    output?: unknown;
  };
  if (row.type === "error" && row.errorText) {
    return { ...state, error: row.errorText };
  }
  if (row.type === "text-delta" && typeof row.delta === "string") {
    return { ...state, text: state.text + row.delta };
  }
  if (row.type === "tool-input-available" && row.toolCallId && row.toolName) {
    toolNames.set(row.toolCallId, row.toolName);
    return state;
  }
  if (row.type === "tool-output-available" && row.toolCallId) {
    const name = toolNames.get(row.toolCallId);
    if (name === "searchKnowledge") {
      const sources = askSourcesFromToolOutput(row.output);
      if (sources.length > 0) {
        return { ...state, sources };
      }
    }
  }
  return state;
}

export function toAskUiMessage(
  id: string,
  role: AskChatRole,
  text: string,
): { id: string; role: AskChatRole; parts: [{ type: "text"; text: string }] } {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
  };
}

export function pruneAskUiMessages<T>(messages: T[]): T[] {
  if (messages.length <= ASK_HISTORY_MAX) {
    return messages;
  }
  return messages.slice(-ASK_HISTORY_MAX);
}
