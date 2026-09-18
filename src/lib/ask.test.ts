import { describe, expect, it } from "vitest";
import {
  applyAskUiChunk,
  askSourcesFromToolOutput,
  clampAskSearchK,
  decideAskAvailability,
  parseAskFollowUps,
  pruneAskUiMessages,
  splitAskAnswer,
} from "@/lib/ask";

describe("ask helpers", () => {
  it("clamps search k", () => {
    expect(clampAskSearchK()).toBe(8);
    expect(clampAskSearchK(0)).toBe(1);
    expect(clampAskSearchK(40)).toBe(12);
  });

  it("blocks when the free bulk cap is gone", () => {
    const now = new Date("2026-09-18T00:00:00.000Z");
    expect(
      decideAskAvailability({
        mockExternal: false,
        hasKey: true,
        paused: false,
        used: 400,
        cap: 400,
        now,
      }),
    ).toMatchObject({
      available: false,
      remaining: 0,
      reason: "本日の無料枠がなくなりました",
    });
  });

  it("blocks mock and missing key without calling paid", () => {
    expect(
      decideAskAvailability({
        mockExternal: true,
        hasKey: true,
        paused: false,
        used: 0,
        cap: 400,
      }).reason,
    ).toBe("モック環境では AI に聞けません");
    expect(
      decideAskAvailability({
        mockExternal: false,
        hasKey: false,
        paused: false,
        used: 0,
        cap: 400,
      }).reason,
    ).toBe("GEMINI_API_KEY がありません");
  });

  it("parses follow-up questions", () => {
    const text = `根拠はこれです [1]。

## 次の質問
まだ実践していないものだけ
英語の情報源は？
関連する記事は？`;
    expect(parseAskFollowUps(text)).toEqual([
      "まだ実践していないものだけ",
      "英語の情報源は？",
      "関連する記事は？",
    ]);
    expect(splitAskAnswer(text).body).toContain("根拠はこれです");
  });

  it("applies streamed search tool output", () => {
    const names = new Map<string, string>();
    const withName = applyAskUiChunk(
      { text: "", sources: [], error: null },
      {
        type: "tool-input-available",
        toolCallId: "c1",
        toolName: "searchKnowledge",
      },
      names,
    );
    const next = applyAskUiChunk(
      withName,
      {
        type: "tool-output-available",
        toolCallId: "c1",
        output: {
          items: [{ id: "s1", summary: "要約" }],
        },
      },
      names,
    );
    expect(next.sources[0]?.id).toBe("s1");
    expect(
      askSourcesFromToolOutput({ items: [{ id: "s1" }, { no: true }] }),
    ).toHaveLength(1);
  });

  it("keeps the last eight ui messages", () => {
    const messages = Array.from({ length: 10 }, (_, index) => index);
    expect(pruneAskUiMessages(messages)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
