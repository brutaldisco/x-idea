import { INFO_TYPE_LABELS, INFO_TYPES } from "@/server/ai/info-types";

export const PROMPT_VERSION = "enrich-v3.0";

export const ENRICH_SYSTEM = `あなたは個人用ナレッジデータベース「Marginalia」の司書である。入力された複数の X 投稿（およびリンク先記事）を、ユーザーの既存分類体系に従って整理する。
規則:
1. 要約は日本語 3 行以内（160 字以内）。原文にない情報・意見を加えない。
2. カテゴリは提示された既存カテゴリ ID から選ぶ。適合が弱い場合は null とし new_category_suggestion に提案を書く。勝手に新設しない。
3. 迷ったときは uncertainty_reason に「何と何の間で迷ったか」を 40 字以内で書く。
4. タグは既存タグを優先。新規タグは一般名詞に正規化（1〜5 個、日本語または英語小文字）。
5. confidence は「同じ入力を 10 回分類したとき同じ結果になる確率」の見積り。
6. key_sentences は原文（投稿または記事）からの逐語抜き出し。言い換え禁止。最大 3。
7. 「過去の修正例」がある場合はその傾向を最優先で反映する。
8. 出力は JSON スキーマに厳密に従う。items の順序と source_id は入力どおり。`;

export type EnrichPromptSource = {
  id: string;
  authorName: string | null;
  authorUsername: string | null;
  postedAt: string | null;
  text: string;
  quoted: string | null;
  articleTitle: string | null;
  articleAuthor: string | null;
  articleText: string | null;
};

export function buildEnrichUserPrompt(input: {
  categories: { id: string; path: string; description: string | null }[];
  tags: string[];
  sources: EnrichPromptSource[];
  infoTypes?: { id: string; name: string }[];
}): string {
  const categoryLines =
    input.categories.length > 0
      ? input.categories
          .map(
            (row) =>
              `- ${row.id}: ${row.path}${row.description ? ` — ${row.description}` : ""}`,
          )
          .join("\n")
      : "- （カテゴリ未作成）";
  const tagLine =
    input.tags.length > 0 ? input.tags.join(" / ") : "（既存タグなし）";
  const infoTypes =
    input.infoTypes && input.infoTypes.length > 0
      ? input.infoTypes
      : INFO_TYPES.map((id) => ({ id, name: INFO_TYPE_LABELS[id] }));
  const typeLine = infoTypes.map((row) => `${row.id}=${row.name}`).join(" / ");
  const items = input.sources
    .map((source) => {
      const article = source.articleTitle
        ? `article: ${source.articleTitle}${source.articleAuthor ? ` / ${source.articleAuthor}` : ""}\n${(source.articleText ?? "").slice(0, 2000)}`
        : "article: なし";
      return `### source_id: ${source.id}
author: ${source.authorName ?? ""} (@${source.authorUsername ?? ""}) posted_at: ${source.postedAt ?? ""}
text: ${source.text}
quoted: ${source.quoted ?? "なし"}
${article}`;
    })
    .join("\n\n");
  return `## 既存カテゴリ（id: パス — 説明）
${categoryLines}
## 既存タグ（頻出上位 100）
${tagLine}
## 情報タイプ定義
${typeLine}
## 対象（${input.sources.length} 件）
${items}`;
}
