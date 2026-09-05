"use client";

import { useEffect, useState } from "react";
import {
  getInstallPrompt,
  isIosDevice,
  isStandaloneDisplay,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/pwa-install";

export function InstallAppCard() {
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setIos(isIosDevice());
    setCanPrompt(getInstallPrompt() !== null);
    return subscribeInstallPrompt(() => {
      setCanPrompt(getInstallPrompt() !== null);
      setStandalone(isStandaloneDisplay());
    });
  }, []);

  if (standalone) {
    return (
      <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
        <h2 className="font-semibold">アプリとして起動中</h2>
        <p className="mt-2 text-ink-2 text-sm">
          ホーム画面から開いています。ブラウザのタブとは別のウィンドウです。
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <h2 className="font-semibold">ホーム画面に追加</h2>
      <p className="mt-2 text-ink-2 text-sm">
        Chrome
        ならインストールすると、独立したウィンドウで開けます。オフラインでも直近のページを読めます。
      </p>
      {canPrompt ? (
        <button
          type="button"
          className="mt-3 rounded-full bg-ink px-4 py-2 text-paper text-sm"
          onClick={() => {
            void promptInstall();
          }}
        >
          アプリとしてインストール
        </button>
      ) : ios ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink-2 text-sm">
          <li>Safari の共有ボタンを開く</li>
          <li>「ホーム画面に追加」を選ぶ</li>
        </ol>
      ) : (
        <p className="mt-3 text-ink-2 text-sm">
          Chrome のアドレスバー右、またはメニューの「Marginalia
          をインストール」から追加できます。
        </p>
      )}
    </article>
  );
}
