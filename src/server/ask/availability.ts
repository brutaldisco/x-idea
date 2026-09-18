import { type AskAvailability, decideAskAvailability } from "@/lib/ask";
import { nextMidnightPacific } from "@/lib/datetime";
import { peekLane } from "@/server/ai/budget";

export async function getAskAvailability(
  now = new Date(),
): Promise<AskAvailability> {
  const peek = await peekLane("bulk", now);
  const availability = decideAskAvailability({
    mockExternal: process.env.MOCK_EXTERNAL === "1",
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    paused: peek.decision.ok ? false : peek.decision.code === "FORBIDDEN",
    used: peek.used,
    cap: peek.cap,
    cooldownUntil:
      !peek.decision.ok && peek.decision.code === "LANE_COOLDOWN"
        ? peek.decision.retryAfter.toISOString()
        : null,
    now,
  });
  if (
    !availability.available &&
    availability.reason === "本日の無料枠がなくなりました" &&
    !availability.resetAt
  ) {
    return {
      ...availability,
      resetAt: nextMidnightPacific(now).toISOString(),
    };
  }
  if (!peek.decision.ok && peek.decision.code === "FORBIDDEN") {
    return {
      ...availability,
      available: false,
      reason: peek.decision.message,
    };
  }
  return availability;
}
