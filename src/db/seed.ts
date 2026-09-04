import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { categories, jobSchedules, settings } from "@/db/schema";
import { nextRunAfter } from "@/lib/cron";
import { logger } from "@/lib/logger";

export const SEED_CATEGORIES = [
  { id: "cat_sociology", name: "社会学", sortOrder: 10 },
  { id: "cat_ai", name: "AI", sortOrder: 20 },
  { id: "cat_org", name: "組織", sortOrder: 30 },
  { id: "cat_design", name: "デザイン", sortOrder: 40 },
  { id: "cat_training", name: "筋力トレーニング", sortOrder: 50 },
  { id: "cat_health", name: "健康", sortOrder: 60 },
  { id: "cat_work", name: "仕事", sortOrder: 70 },
  { id: "cat_thought", name: "思想", sortOrder: 80 },
] as const;

export const SEED_SCHEDULES = [
  { key: "sync", jobType: "sync_bookmarks", cronExpr: "*/30 * * * *" },
  { key: "folders", jobType: "sync_folders", cronExpr: "15 3 * * *" },
  { key: "echo", jobType: "schedule_echo", cronExpr: "0 6 * * *" },
  { key: "briefing", jobType: "build_briefing", cronExpr: "0 7 * * *" },
  { key: "insights", jobType: "build_insights", cronExpr: "0 8 * * 0" },
  { key: "layout", jobType: "compute_layout", cronExpr: "30 4 * * 1" },
] as const;

const TZ = "Asia/Tokyo";

export async function seed(): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = await db
    .select({ id: settings.id })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(settings).values({
      id: 1,
      xApiEnabled: 0,
      aiPaidEnabled: 0,
      threadExpandEnabled: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const category of SEED_CATEGORIES) {
    const found = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, category.id))
      .limit(1);
    if (found.length === 0) {
      await db.insert(categories).values({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        createdAt: now,
      });
    }
  }

  const from = new Date();
  for (const schedule of SEED_SCHEDULES) {
    const found = await db
      .select({ key: jobSchedules.key })
      .from(jobSchedules)
      .where(eq(jobSchedules.key, schedule.key))
      .limit(1);
    if (found.length === 0) {
      await db.insert(jobSchedules).values({
        key: schedule.key,
        jobType: schedule.jobType,
        cronExpr: schedule.cronExpr,
        tz: TZ,
        enabled: 1,
        nextRunAt: nextRunAfter(schedule.cronExpr, from, TZ).toISOString(),
      });
    }
  }

  logger.info("seed complete");
}
