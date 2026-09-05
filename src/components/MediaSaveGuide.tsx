"use client";

import { useEffect, useState } from "react";
import { probeLocalCompanion } from "@/lib/media-companion";

export function MediaSaveGuide({
  localRoot,
  localEnabled,
}: {
  localRoot: string;
  localEnabled: boolean;
}) {
  const [companion, setCompanion] = useState<{
    ok: boolean;
    root?: string;
  } | null>(null);

  useEffect(() => {
    void probeLocalCompanion().then(setCompanion);
  }, []);

  const connected = companion?.ok === true;
  const root = companion?.root ?? localRoot;

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">この PC に画像・動画を保存する</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            connected ? "bg-ok/15 text-ok" : "bg-paper text-ink-2"
          }`}
        >
          {companion == null
            ? "確認中…"
            : connected
              ? "保存役に接続できています"
              : "保存役が起動していません"}
        </span>
      </div>
      <p className="mt-2 text-ink-2 text-sm">
        本番サイト（https://x-idea.vercel.app）ではファイルを置けません。同じ PC
        で保存役を起動したまま本番を開くと、画像は WebP、動画は mp4
        でこのフォルダに保存されます。
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
        <li>
          ターミナルを開き、プロジェクトフォルダで{" "}
          <code className="rounded bg-paper px-1 text-xs">pnpm dev</code>{" "}
          を実行する。この窓は閉じない。
        </li>
        <li>
          ブラウザで{" "}
          <a
            className="text-accent underline-offset-2 hover:underline"
            href="/"
          >
            http://127.0.0.1:3000
          </a>{" "}
          を開き、この画面のバッジが「保存役に接続できています」になることを確認する。
        </li>
        <li>
          同じブラウザで{" "}
          <a
            className="text-accent underline-offset-2 hover:underline"
            href="https://x-idea.vercel.app"
            target="_blank"
            rel="noreferrer"
          >
            https://x-idea.vercel.app
          </a>{" "}
          を開き、Library や投稿（原文）を見る。
        </li>
        <li>
          下のパスにファイルが増える。Finder
          で確認する（リンクを押すとフォルダが開きます）。
        </li>
      </ol>
      <p className="mt-3 break-all font-mono text-ink-2 text-xs">{root}</p>
      {localEnabled ? (
        <p className="mt-2 text-ink-2 text-xs">
          いま開いているのがこの PC の保存役です。本番を見るときも、この{" "}
          <code>pnpm dev</code> は動かしたままにしてください。
        </p>
      ) : (
        <p className="mt-2 text-ink-2 text-xs">
          いま開いているのは本番です。保存するには、この PC で手順 1 の{" "}
          <code>pnpm dev</code> が必要です。
        </p>
      )}
    </article>
  );
}
