"use client";

import { useState } from "react";
import {
  getLanguageDetectorCtor,
  getTranslatorCtor,
  primaryLanguage,
  selectElementText,
  shouldOfferTranslate,
} from "@/lib/chrome-translate";

const TARGET = "ja";

async function detectSourceLanguage(
  text: string,
  hinted: string | null,
): Promise<string | null> {
  if (hinted) {
    return hinted;
  }
  const Detector = getLanguageDetectorCtor();
  if (!Detector) {
    return null;
  }
  try {
    if (typeof Detector.availability === "function") {
      const ready = await Detector.availability();
      if (ready === "unavailable") {
        return null;
      }
    }
    const detector = await Detector.create();
    const results = await detector.detect(text);
    return primaryLanguage(results[0]?.detectedLanguage);
  } catch {
    return null;
  }
}

export function ChromeTranslate({
  text,
  lang,
  targetId,
}: {
  text: string;
  lang: string | null;
  targetId: string;
}) {
  const offer = shouldOfferTranslate(text, lang);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [translated, setTranslated] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const selectOriginal = () => {
    const node = document.getElementById(targetId);
    const ok = selectElementText(node);
    setHint(
      ok
        ? "原文を選択しました。右クリック → 「日本語に翻訳」を選んでください。"
        : "原文をドラッグして選択し、右クリック → 「日本語に翻訳」を選んでください。",
    );
  };

  const translate = () => {
    setBusy(true);
    setHint(null);
    setProgress(null);
    void (async () => {
      const Translator = getTranslatorCtor();
      if (!Translator) {
        selectOriginal();
        setHint(
          "この Chrome ではワンクリック翻訳が使えません。選択した原文を右クリックして「日本語に翻訳」を選んでください。",
        );
        return;
      }
      const source = await detectSourceLanguage(text, primaryLanguage(lang));
      if (!source || source === TARGET) {
        selectOriginal();
        setHint(
          "原文の言語を特定できませんでした。選択した原文を右クリックして「日本語に翻訳」を選んでください。",
        );
        return;
      }
      const options = { sourceLanguage: source, targetLanguage: TARGET };
      try {
        const availability = await Translator.availability(options);
        if (availability === "unavailable") {
          selectOriginal();
          setHint(
            "この言語の翻訳モデルがありません。原文を選択して右クリック → 「日本語に翻訳」を試してください。",
          );
          return;
        }
        if (availability === "downloadable" || availability === "downloading") {
          setHint("初回だけ Chrome が翻訳モデルをダウンロードします。");
        }
        const translator = await Translator.create({
          ...options,
          monitor(monitor) {
            monitor.addEventListener("downloadprogress", (event) => {
              const progressEvent = event as ProgressEvent;
              if (progressEvent.total > 0) {
                setProgress(
                  Math.round(
                    (progressEvent.loaded / progressEvent.total) * 100,
                  ),
                );
              }
            });
          },
        });
        const result = await translator.translate(text);
        setTranslated(result);
        setHint(null);
      } catch {
        selectOriginal();
        setHint(
          "翻訳を開始できませんでした。原文を選択して右クリック → 「日本語に翻訳」を選んでください。",
        );
      }
    })().finally(() => {
      setBusy(false);
      setProgress(null);
    });
  };

  if (!text.trim()) {
    return null;
  }

  return (
    <div className="notranslate mt-3" lang="ja" translate="no">
      <div className="flex flex-wrap items-center gap-2">
        {offer ? (
          <button
            type="button"
            disabled={busy}
            onClick={translate}
            className="rounded-full bg-ink px-3 py-1.5 text-paper text-xs disabled:opacity-40"
          >
            {busy
              ? progress != null
                ? `準備中 ${progress}%`
                : "翻訳中…"
              : "日本語に翻訳"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={selectOriginal}
          className="rounded-full border border-line px-3 py-1.5 text-xs hover:bg-paper"
        >
          原文を選択
        </button>
      </div>
      <p className="mt-2 text-ink-2 text-xs leading-5">
        Chrome
        の翻訳です。サーバーには送りません。ワンクリックできないときは「原文を選択」→
        右クリック → 日本語に翻訳。
      </p>
      {hint ? <p className="mt-1 text-ink-2 text-xs">{hint}</p> : null}
      {translated ? (
        <div className="mt-3 rounded-xl border border-line bg-paper px-3 py-2">
          <p className="text-ink-2 text-xs">Chrome 翻訳</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
            {translated}
          </p>
        </div>
      ) : null}
    </div>
  );
}
