import type { z } from "zod";
import { AppError } from "@/lib/errors";

export function parseJson<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      "VALIDATION",
      result.error.issues[0]?.message ?? "入力が不正です",
    );
  }
  return result.data;
}
