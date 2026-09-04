import { getHealth, type HealthPayload } from "@/server/health";
import { type AccountContext, getAccountContext } from "@/server/x/context";

export type TodayState = {
  empty: "unlinked" | "needs_credits" | "importing" | "ready";
  health: HealthPayload;
  ctx: AccountContext;
};

export async function getTodayState(): Promise<TodayState> {
  const ctx = await getAccountContext();
  const health = await getHealth(ctx);
  if (!health.x_connected) {
    return { empty: "unlinked", health, ctx };
  }
  if (!health.x_api_enabled) {
    return { empty: "needs_credits", health, ctx };
  }
  if (!health.last_synced_at) {
    return { empty: "importing", health, ctx };
  }
  return { empty: "ready", health, ctx };
}
