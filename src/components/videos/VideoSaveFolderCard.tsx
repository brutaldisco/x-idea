"use client";

import { useState } from "react";
import { useVideoSaveFolder } from "@/lib/video-folder";

export function VideoSaveFolderCard({
  accountLabel,
  initialFolderName,
}: {
  accountLabel: string;
  initialFolderName?: string | null;
}) {
  const { supported, folderName, linked, persistWarning, linkFolder } =
    useVideoSaveFolder(initialFolderName);
  const [message, setMessage] = useState<string | null>(null);

  async function onPick() {
    try {
      await linkFolder();
      setMessage(null);
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        return;
      }
      setMessage(error instanceof Error ? error.message : "失敗しました");
    }
  }

  const badge = linked ? "リンク済" : folderName ? "要再リンク" : "未リンク";

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">保存フォルダ</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            linked ? "bg-ok/15 text-ok" : "bg-paper text-ink-2"
          }`}
        >
          {badge}
        </span>
      </div>
      {supported === false ? (
        <p className="mt-2 text-ink-2 text-sm">
          このブラウザではフォルダ保存に対応していません。Chrome / Edge
          で開いてください。通常ダウンロードは各動画の「ファイルを保存」からできます。
        </p>
      ) : (
        <>
          <p className="mt-2 text-ink-2 text-sm">
            フォルダ名は全環境で共有します。書き込み許可はブラウザごとなので、localhost
            と本番、別ブラウザでは同じフォルダをもう一度選んでください。
          </p>
          <p className="mt-2 text-ink-2 text-xs">{accountLabel}</p>
          {folderName ? (
            <p className="mt-1 break-all font-mono text-ink-2 text-xs">
              {folderName}
            </p>
          ) : null}
          {supported ? (
            <button
              type="button"
              onClick={() => void onPick()}
              className="mt-3 rounded-full bg-ink px-4 py-2 text-paper text-sm"
            >
              {folderName ? "再リンク" : "保存フォルダを選ぶ"}
            </button>
          ) : null}
        </>
      )}
      {persistWarning ? (
        <p className="mt-2 text-ink-2 text-xs">{persistWarning}</p>
      ) : null}
      {message ? <p className="mt-2 text-ink-2 text-xs">{message}</p> : null}
    </article>
  );
}
