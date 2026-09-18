import { stepCountIs, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { clampAskSearchK } from "@/lib/ask";
import { budget } from "@/server/ai/budget";
import { googleLanguageModel } from "@/server/ai/client";
import { thinkingLevel } from "@/server/ai/lanes";
import { ASK_SYSTEM } from "@/server/ai/prompts/ask";
import { loadAskSource } from "@/server/ask/source";
import { searchKeyword } from "@/server/search/keyword";
import type { SourceListItem } from "@/server/sources/query";
import { taxonomyForAccount } from "@/server/taxonomy";
import { type AccountContext, contextAccountId } from "@/server/x/context";

const READ_STATUSES = ["unread", "read", "to_practice", "practiced"] as const;

function cardForAsk(item: SourceListItem, n: number) {
  return {
    n,
    id: item.id,
    summary: item.summary,
    url: item.url,
    authorName: item.authorName,
    authorUsername: item.authorUsername,
    authorAvatarUrl: item.authorAvatarUrl,
    mediaId: item.mediaId,
    mediaType: item.mediaType,
    videoSaveStatus: item.videoSaveStatus,
    videoRelPath: item.videoRelPath,
    durationMs: item.durationMs,
    categoryId: item.categoryId,
    infoType: item.infoType,
    kind: item.kind,
    hasQueueableVideos: item.hasQueueableVideos,
    lang: item.lang,
    summaryFromAi: item.summaryFromAi,
    postedAt: item.postedAt,
  };
}

export function createAskAgent(input: { ctx: AccountContext; model: string }) {
  const accountId = contextAccountId(input.ctx);
  const model = googleLanguageModel(input.model);
  const level = thinkingLevel("bulk", "summarize");

  return new ToolLoopAgent({
    id: "ask",
    model,
    instructions: ASK_SYSTEM,
    stopWhen: stepCountIs(4),
    providerOptions: {
      google: {
        thinkingConfig: { thinkingLevel: level },
      },
    },
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 0) {
        return {
          toolChoice: { type: "tool", toolName: "searchKnowledge" },
        };
      }
      return {};
    },
    onStepStart: async () => {
      await budget.guard("bulk");
    },
    onStepEnd: async (event) => {
      try {
        await budget.record({
          lane: "bulk",
          model: input.model,
          inputTokens: event.usage?.inputTokens,
          outputTokens: event.usage?.outputTokens,
        });
      } catch {
        // 記録失敗でも回答ストリームは止めない
      }
    },
    tools: {
      searchKnowledge: tool({
        description:
          "保存情報をキーワード検索する。回答の前に必ず使う。k は最大 12。",
        inputSchema: z.object({
          query: z.string().min(1).max(80),
          k: z.number().int().min(1).max(12).optional(),
          category_id: z.string().optional(),
          info_type: z.string().optional(),
          read_status: z.enum(READ_STATUSES).optional(),
        }),
        execute: async ({ query, k, category_id, info_type, read_status }) => {
          const items = await searchKeyword({
            q: query,
            ctx: input.ctx,
            limit: clampAskSearchK(k),
            filters: {
              categoryId: category_id,
              infoType: info_type,
              readStatus: read_status,
            },
          });
          return {
            found: items.length > 0,
            items: items.map((item, index) => cardForAsk(item, index + 1)),
          };
        },
      }),
      getSource: tool({
        description:
          "1件の Source の本文・記事抜粋を読む。user_note は含まない。",
        inputSchema: z.object({
          id: z.string().min(1),
        }),
        execute: async ({ id }) => {
          const source = await loadAskSource(id, input.ctx);
          if (!source) {
            return { found: false, id };
          }
          return { found: true, ...source };
        },
      }),
      listCategories: tool({
        description: "選択中アカウントのカテゴリと情報タイプを列挙する。",
        inputSchema: z.object({}),
        execute: async () => {
          const taxonomy = await taxonomyForAccount(accountId);
          return {
            categories: taxonomy.categories.map((item) => ({
              id: item.id,
              name: item.name,
            })),
            infoTypes: taxonomy.infoTypes.map((item) => ({
              id: item.id,
              name: item.name,
            })),
          };
        },
      }),
    },
  });
}
