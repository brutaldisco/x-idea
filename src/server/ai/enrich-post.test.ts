import { describe, expect, it } from "vitest";
import {
  applyEnrichItem,
  clampSummary,
  decideTriage,
  normalizeTagName,
  pickKeySentences,
} from "@/server/ai/enrich-post";
import type { EnrichItemOutput } from "@/server/ai/enrich-schema";

const categoryIds = new Set(["cat_ai", "cat_thought"]);

function item(overrides: Partial<EnrichItemOutput> = {}): EnrichItemOutput {
  return {
    source_id: "s1",
    summary: "要約です",
    category_id: "cat_ai",
    category_confidence: 0.9,
    category_candidates: [{ category_id: "cat_ai", confidence: 0.9 }],
    new_category_suggestion: null,
    uncertainty_reason: null,
    tags: ["LLM", "生成ＡＩ"],
    info_type: "idea",
    info_type_confidence: 0.7,
    importance: 2,
    language: "ja",
    key_sentences: ["原文の一文"],
    ...overrides,
  };
}

describe("tag and sentence helpers", () => {
  it("normalizes tags with NFKC and latin lowercase", () => {
    expect(normalizeTagName("  生成ＡＩ ")).toBe("生成ai");
    expect(normalizeTagName("LLM")).toBe("llm");
  });

  it("keeps only verbatim key sentences", () => {
    expect(
      pickKeySentences(
        ["原文の一文", "言い換えた文", "原文の 一文"],
        "前置き 原文の一文 続き",
      ),
    ).toEqual(["原文の一文", "原文の 一文"]);
  });

  it("clamps summary to 3 lines and 160 chars", () => {
    expect(clampSummary("a\n\nb\nc\nd")).toBe("a\nb\nc");
    expect(clampSummary("あ".repeat(200)).length).toBe(160);
  });
});

describe("triage post-process", () => {
  it("auto-files only when category exists and confidence meets the threshold", () => {
    expect(decideTriage("cat_ai", 0.8, 0.8)).toBe("auto_filed");
    expect(decideTriage("cat_ai", 0.79, 0.8)).toBe("needs_review");
    expect(decideTriage(null, 0.99, 0.8)).toBe("needs_review");
  });

  it("drops unknown categories and invented key sentences", () => {
    const applied = applyEnrichItem(
      item({
        category_id: "cat_missing",
        key_sentences: ["存在しない文", "保存された原文"],
        tags: ["LLM", "llm", ""],
      }),
      {
        sourceId: "s1",
        corpus: "これは保存された原文です",
        categoryIds,
        threshold: 0.8,
        aliases: new Map([["llm", "大規模言語モデル"]]),
      },
    );
    expect(applied.triage).toBe("needs_review");
    expect(applied.categoryId).toBeNull();
    expect(applied.keySentences).toEqual(["保存された原文"]);
    expect(applied.tags).toEqual(["大規模言語モデル"]);
  });
});

describe("eval set (post-process precision)", () => {
  it("keeps auto_file / review labels at or above 0.7", () => {
    const corpus = "評価用の原文です。ここから抜き出します。";
    let correct = 0;
    const total = 50;
    for (let i = 0; i < total; i += 1) {
      const mode = i % 5;
      const raw = item({
        source_id: `s${i}`,
        category_id: mode === 0 ? "cat_missing" : mode === 1 ? null : "cat_ai",
        category_confidence: mode === 2 ? 0.5 : 0.91,
        key_sentences: mode === 3 ? ["嘘の文"] : ["評価用の原文です。"],
      });
      const applied = applyEnrichItem(raw, {
        sourceId: `s${i}`,
        corpus,
        categoryIds,
        threshold: 0.8,
      });
      const expectAuto = mode === 4 || mode === 3;
      if (expectAuto) {
        if (
          applied.triage === "auto_filed" &&
          applied.categoryId === "cat_ai"
        ) {
          correct += 1;
        }
      } else if (applied.triage === "needs_review") {
        correct += 1;
      }
    }
    expect(correct / total).toBeGreaterThanOrEqual(0.7);
    expect(correct).toBe(total);
  });
});
