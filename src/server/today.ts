import { getHealth, type HealthPayload } from "@/server/health";

export type TodayState = {
  empty: "unlinked" | "importing" | "ready";
  health: HealthPayload;
};

export async function getTodayState(): Promise<TodayState> {
  const health = await getHealth();
  if (!health.x_connected) {
    return { empty: "unlinked", health };
  }
  if (!health.last_synced_at) {
    return { empty: "importing", health };
  }
  return { empty: "ready", health };
}
