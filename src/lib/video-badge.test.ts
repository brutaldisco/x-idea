import { describe, expect, it } from "vitest";
import { videoBadgeCopy } from "@/lib/video-badge";

describe("videoBadgeCopy", () => {
  it("marks ready downloads as saved", () => {
    expect(videoBadgeCopy("ready")).toEqual({
      label: "保存済",
      title: "この端末に保存済み",
      tone: "saved",
    });
  });

  it("marks queue and download as キュー", () => {
    expect(videoBadgeCopy("queued")).toEqual({
      label: "キュー",
      title: "ダウンロード待ち、または実行中",
      tone: "pending",
    });
    expect(videoBadgeCopy("downloading").label).toBe("キュー");
  });

  it("keeps unsaved videos as 動画", () => {
    expect(videoBadgeCopy(null).label).toBe("動画");
    expect(videoBadgeCopy("failed").label).toBe("動画");
  });
});
