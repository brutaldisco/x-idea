export type VideoBadgeTone = "saved" | "pending" | "video";

export type VideoBadgeCopy = {
  label: string;
  title: string;
  tone: VideoBadgeTone;
};

export function videoBadgeCopy(
  saveStatus: string | null | undefined,
): VideoBadgeCopy {
  if (saveStatus === "ready") {
    return {
      label: "保存済",
      title: "この端末に保存済み",
      tone: "saved",
    };
  }
  if (saveStatus === "queued" || saveStatus === "downloading") {
    return {
      label: "キュー",
      title: "ダウンロード待ち、または実行中",
      tone: "pending",
    };
  }
  return {
    label: "動画",
    title: "未保存。Videos から保存できます",
    tone: "video",
  };
}
