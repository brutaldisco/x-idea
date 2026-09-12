"use client";

import { useState } from "react";
import { ReaderBody } from "@/components/ReaderBody";
import {
  detectSourceLanguage,
  getTranslatorCtor,
  selectElementText,
  shouldOfferTranslate,
} from "@/lib/chrome-translate";
import { packReaderLinesForTranslate } from "@/lib/reader-paragraphs";

const TARGET = "ja";

export function ChromeTranslate({
  text,
  lang,
  targetId,
  className,
}: {
  text: string;
  lang: string | null;
  targetId: string;
  className?: string;
}) {
  const offer = shouldOfferTranslate(text, lang);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [translated, setTranslated] = useState<string | null>(null);

  const selectOriginal = () => {
    selectElementText(document.getElementById(targetId));
  };

  const translate = () => {
    setBusy(true);
    setProgress(null);
    void (async () => {
      const Translator = getTranslatorCtor();
      if (!Translator) {
        selectOriginal();
        return;
      }
      const source = await detectSourceLanguage(text, lang);
      if (!source || source === TARGET) {
        selectOriginal();
        return;
      }
      const options = { sourceLanguage: source, targetLanguage: TARGET };
      try {
        const availability = await Translator.availability(options);
        if (availability === "unavailable") {
          selectOriginal();
          return;
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
        const result = await translator.translate(
          packReaderLinesForTranslate(text),
        );
        setTranslated(result);
      } catch {
        selectOriginal();
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
    <div
      className={`notranslate ${className ?? "mt-3"}`}
      lang="ja"
      translate="no"
    >
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
      {translated ? (
        <div className="mt-3 rounded-xl border border-line bg-paper px-3 py-2">
          <p className="text-ink-2 text-xs">Chrome 翻訳</p>
          <ReaderBody className="reader-body mt-1" text={translated} readable />
        </div>
      ) : null}
    </div>
  );
}
