export const INFO_TYPES = [
  "theory",
  "method",
  "procedure",
  "research",
  "case",
  "opinion",
  "counter",
  "tool",
  "quote",
  "idea",
  "news",
  "resource",
] as const;

export type InfoType = (typeof INFO_TYPES)[number];

export const INFO_TYPE_LABELS: Record<InfoType, string> = {
  theory: "理論・概念",
  method: "方法・考え方",
  procedure: "手順",
  research: "研究・データ",
  case: "事例",
  opinion: "意見",
  counter: "反論",
  tool: "ツール",
  quote: "引用・名言",
  idea: "アイデア",
  news: "ニュース",
  resource: "まとめ・リンク集",
};

export function isInfoType(value: string): value is InfoType {
  return (INFO_TYPES as readonly string[]).includes(value);
}
