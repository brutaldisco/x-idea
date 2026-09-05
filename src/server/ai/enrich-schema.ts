import { z } from "zod";
import { INFO_TYPES } from "@/server/ai/info-types";

export const enrichItemSchema = z.object({
  source_id: z.string().min(1),
  summary: z.string(),
  category_id: z.string().nullable(),
  category_confidence: z.number().min(0).max(1),
  category_candidates: z
    .array(
      z.object({
        category_id: z.string(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(3)
    .default([]),
  new_category_suggestion: z.string().nullable(),
  uncertainty_reason: z.string().nullable(),
  tags: z.array(z.string()).min(1).max(5),
  info_type: z.enum(INFO_TYPES),
  info_type_confidence: z.number().min(0).max(1),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  language: z.string().min(1).max(16),
  key_sentences: z.array(z.string()).max(3).default([]),
});

export const enrichBatchSchema = z.object({
  items: z.array(enrichItemSchema).min(1).max(5),
});

export type EnrichItemOutput = z.infer<typeof enrichItemSchema>;
export type EnrichBatchOutput = z.infer<typeof enrichBatchSchema>;
