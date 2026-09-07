export type TranslatorAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable";

export type ChromeTranslator = {
  translate(input: string): Promise<string>;
};

export type ChromeTranslatorCtor = {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<TranslatorAvailability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<ChromeTranslator>;
};

export type ChromeLanguageDetector = {
  detect(
    input: string,
  ): Promise<Array<{ detectedLanguage?: string; confidence?: number }>>;
};

export type ChromeLanguageDetectorCtor = {
  availability?: () => Promise<TranslatorAvailability>;
  create(): Promise<ChromeLanguageDetector>;
};

const KANA = /[\u3040-\u309f\u30a0-\u30ff]/u;
const KANA_RATIO = 0.12;
const LOW_DETECT_CONFIDENCE = 0.4;

function normalizeLangTag(lang: string | null | undefined): string | null {
  if (!lang) {
    return null;
  }
  const trimmed = lang.trim().toLowerCase().replaceAll("_", "-");
  if (!trimmed || trimmed === "und" || trimmed === "zxx") {
    return null;
  }
  return trimmed;
}

export function primaryLanguage(
  lang: string | null | undefined,
): string | null {
  const trimmed = normalizeLangTag(lang);
  if (!trimmed) {
    return null;
  }
  const base = trimmed.split("-")[0];
  return base && base.length >= 2 ? base : null;
}

export function translatorLanguage(
  lang: string | null | undefined,
): string | null {
  const trimmed = normalizeLangTag(lang);
  if (!trimmed) {
    return null;
  }
  const parts = trimmed.split("-");
  const base = parts[0];
  if (!base || base.length < 2) {
    return null;
  }
  if (base === "zh") {
    const traditional = parts.some(
      (part) =>
        part === "hant" || part === "tw" || part === "hk" || part === "mo",
    );
    return traditional ? "zh-Hant" : "zh";
  }
  return base;
}

export function htmlLanguage(lang: string | null | undefined): string | null {
  const pair = translatorLanguage(lang);
  if (pair === "zh-Hant") {
    return "zh-Hant";
  }
  return primaryLanguage(lang);
}

export function isJapaneseLang(lang: string | null | undefined): boolean {
  return primaryLanguage(lang) === "ja";
}

export function looksMostlyJapanese(text: string): boolean {
  const chars = [...text].filter((char) => !/\s/u.test(char));
  if (chars.length === 0) {
    return false;
  }
  const kana = chars.filter((char) => KANA.test(char)).length;
  if (chars.length < 8) {
    return kana > 0;
  }
  return kana / chars.length >= KANA_RATIO;
}

export function shouldOfferTranslate(
  text: string,
  _lang?: string | null,
): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) {
    return false;
  }
  return !looksMostlyJapanese(trimmed);
}

export function translatableProps(
  lang: string | null | undefined,
  fromAi: boolean,
): { lang?: string; translate: "yes" | "no" } {
  if (fromAi) {
    return { lang: "ja", translate: "no" };
  }
  const code = htmlLanguage(lang);
  return {
    ...(code ? { lang: code } : {}),
    translate: "yes",
  };
}

export function resolveSourceLanguage(input: {
  detected?: string | null;
  confidence?: number | null;
  hinted?: string | null;
}): string | null {
  const detected = translatorLanguage(input.detected);
  const hinted = translatorLanguage(input.hinted);
  const score = input.confidence ?? 1;

  if (detected && detected !== "ja" && score >= LOW_DETECT_CONFIDENCE) {
    return detected;
  }
  if (hinted && hinted !== "ja") {
    return hinted;
  }
  if (detected && detected !== "ja") {
    return detected;
  }
  return detected ?? hinted;
}

export function getTranslatorCtor(): ChromeTranslatorCtor | null {
  const ctor = (globalThis as { Translator?: ChromeTranslatorCtor }).Translator;
  return ctor ?? null;
}

export function getLanguageDetectorCtor(): ChromeLanguageDetectorCtor | null {
  const ctor = (globalThis as { LanguageDetector?: ChromeLanguageDetectorCtor })
    .LanguageDetector;
  return ctor ?? null;
}

export async function detectSourceLanguage(
  text: string,
  hinted: string | null,
): Promise<string | null> {
  const Detector = getLanguageDetectorCtor();
  if (!Detector) {
    return resolveSourceLanguage({ detected: null, hinted });
  }
  try {
    if (typeof Detector.availability === "function") {
      const ready = await Detector.availability();
      if (ready === "unavailable") {
        return resolveSourceLanguage({ detected: null, hinted });
      }
    }
    const detector = await Detector.create();
    const results = await detector.detect(text);
    const top = results[0];
    return resolveSourceLanguage({
      detected: top?.detectedLanguage,
      confidence: top?.confidence,
      hinted,
    });
  } catch {
    return resolveSourceLanguage({ detected: null, hinted });
  }
}

export function selectElementText(node: HTMLElement | null): boolean {
  if (!node || typeof window === "undefined") {
    return false;
  }
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
