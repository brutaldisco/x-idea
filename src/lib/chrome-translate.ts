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

export function primaryLanguage(
  lang: string | null | undefined,
): string | null {
  if (!lang) {
    return null;
  }
  const trimmed = lang.trim().toLowerCase().replaceAll("_", "-");
  if (!trimmed || trimmed === "und" || trimmed === "zxx") {
    return null;
  }
  const base = trimmed.split("-")[0];
  return base && base.length >= 2 ? base : null;
}

export function isJapaneseLang(lang: string | null | undefined): boolean {
  return primaryLanguage(lang) === "ja";
}

export function looksMostlyJapanese(text: string): boolean {
  const chars = [...text].filter((char) => !/\s/u.test(char));
  if (chars.length === 0) {
    return false;
  }
  const jp = chars.filter((char) =>
    /[\u3040-\u30ff\u4e00-\u9fff]/u.test(char),
  ).length;
  if (chars.length < 8) {
    return jp > 0 && !/[A-Za-z]{8,}/.test(text);
  }
  return jp / chars.length >= 0.35;
}

export function shouldOfferTranslate(
  text: string,
  lang: string | null | undefined,
): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) {
    return false;
  }
  if (looksMostlyJapanese(trimmed)) {
    return false;
  }
  if (isJapaneseLang(lang) && trimmed.length < 40) {
    return false;
  }
  return true;
}

export function translatableProps(
  lang: string | null | undefined,
  fromAi: boolean,
): { lang?: string; translate: "yes" | "no" } {
  if (fromAi) {
    return { lang: "ja", translate: "no" };
  }
  const code = primaryLanguage(lang);
  return {
    ...(code ? { lang: code } : {}),
    translate: "yes",
  };
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
