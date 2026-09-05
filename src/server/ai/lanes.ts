export const LANES = ["bulk", "quality", "embed"] as const;
export type Lane = (typeof LANES)[number];

export const DEFAULT_MODELS: Record<Lane, string> = {
  bulk: "gemini-3.5-flash-lite",
  quality: "gemini-3.6-flash",
  embed: "gemini-embedding-2",
};

export const DEFAULT_CAPS: Record<Lane, number> = {
  bulk: 400,
  quality: 16,
  embed: 800,
};

export type ThinkingKind = "classify" | "summarize" | "quality";
export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

export function isLane(value: string): value is Lane {
  return (LANES as readonly string[]).includes(value);
}

export function thinkingLevel(lane: Lane, kind?: ThinkingKind): ThinkingLevel {
  if (lane === "quality" || kind === "quality") {
    return "medium";
  }
  if (kind === "classify") {
    return "minimal";
  }
  return "low";
}

function parseJsonRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function parseLaneModels(raw: unknown): Record<Lane, string> {
  const parsed = parseJsonRecord(raw);
  const models = { ...DEFAULT_MODELS };
  for (const lane of LANES) {
    const value = parsed[lane];
    if (typeof value === "string" && value.trim()) {
      models[lane] = value.trim();
    }
  }
  return models;
}

export function parseLaneCaps(raw: unknown): Record<Lane, number> {
  const parsed = parseJsonRecord(raw);
  const caps = { ...DEFAULT_CAPS };
  for (const lane of LANES) {
    const value = parsed[lane];
    if (typeof value === "number" && Number.isFinite(value)) {
      caps[lane] = Math.max(0, Math.round(value));
    }
  }
  return caps;
}
