import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embed, generateText, Output } from "ai";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import { budget } from "@/server/ai/budget";
import { type Lane, type ThinkingKind, thinkingLevel } from "@/server/ai/lanes";
import { getAiLaneSettings } from "@/server/settings";

export type LaneCallContext = {
  lane: Lane;
  model: string;
  thinkingLevel: ReturnType<typeof thinkingLevel>;
};

export type LaneCallResult<T> = {
  value: T;
  usage?: { inputTokens?: number; outputTokens?: number };
};

function googleProvider() {
  return createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
  });
}

function assertLiveAi(): void {
  if (process.env.MOCK_EXTERNAL === "1") {
    throw new AppError(
      "INTERNAL",
      "MOCK_EXTERNAL=1 では実 Gemini 呼び出しをしません",
    );
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError("FORBIDDEN", "GEMINI_API_KEY がありません");
  }
}

export async function withLaneCall<T>(
  lane: Lane,
  fn: (ctx: LaneCallContext) => Promise<LaneCallResult<T>>,
  options?: { kind?: ThinkingKind; now?: Date },
): Promise<T> {
  await budget.guard(lane, options?.now);
  const settings = await getAiLaneSettings();
  const model = settings.models[lane];
  const ctx: LaneCallContext = {
    lane,
    model,
    thinkingLevel: thinkingLevel(lane, options?.kind),
  };
  try {
    const out = await fn(ctx);
    await budget.record({
      lane,
      model,
      inputTokens: out.usage?.inputTokens,
      outputTokens: out.usage?.outputTokens,
      now: options?.now,
    });
    return out.value;
  } catch (error) {
    await budget.noteError(lane, model, error, options?.now);
    throw error;
  }
}

export async function generateLaneObject<T>(input: {
  lane: Lane;
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  kind?: ThinkingKind;
}): Promise<T> {
  return withLaneCall(
    input.lane,
    async (ctx) => {
      assertLiveAi();
      const result = await generateText({
        model: googleProvider()(ctx.model),
        output: Output.object({ schema: input.schema }),
        prompt: input.prompt,
        system: input.system,
        providerOptions: {
          google: {
            thinkingConfig: { thinkingLevel: ctx.thinkingLevel },
          },
        },
      });
      if (result.output == null) {
        throw new AppError("INTERNAL", "構造化出力が空でした");
      }
      return {
        value: result.output,
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        },
      };
    },
    { kind: input.kind },
  );
}

export async function embedInLane(
  value: string,
  taskType:
    | "RETRIEVAL_DOCUMENT"
    | "RETRIEVAL_QUERY"
    | "SEMANTIC_SIMILARITY" = "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  return withLaneCall("embed", async (ctx) => {
    assertLiveAi();
    const result = await embed({
      model: googleProvider().embedding(ctx.model),
      value,
      providerOptions: {
        google: {
          outputDimensionality: 768,
          taskType,
        },
      },
    });
    return {
      value: result.embedding,
      usage: {
        inputTokens: result.usage.tokens ?? 0,
        outputTokens: 0,
      },
    };
  });
}
