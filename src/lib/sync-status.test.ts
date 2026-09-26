import { describe, expect, it } from "vitest";
import { describeSyncResult } from "./sync-status";

describe("describeSyncResult", () => {
  it("says how many new bookmarks were added", () => {
    expect(
      describeSyncResult({ ok: true, created: 3, errors: 0, kind: "sync" }),
    ).toEqual({
      phase: "done",
      title: "取得済み",
      detail: "新着 3 件をライブラリに追加しました。",
    });
  });

  it("says when nothing new arrived", () => {
    expect(
      describeSyncResult({ ok: true, created: 0, errors: 0, kind: "sync" })
        .detail,
    ).toBe("新しいブックマークはありませんでした。");
  });

  it("reports a failed fetch", () => {
    expect(
      describeSyncResult({ ok: false, created: 0, errors: 1, kind: "sync" })
        .phase,
    ).toBe("error");
  });
});
