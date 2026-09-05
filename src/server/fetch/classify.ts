export type ArticleScope =
  | "full"
  | "partial"
  | "metadata_only"
  | "failed"
  | "pending";

const PAYWALL =
  /subscribe to (read|continue)|paywall|metered|会員限定|登録して続き|続きを読むには購読/i;

export function looksLikePaywall(text: string): boolean {
  return PAYWALL.test(text);
}

export function classifyArticleScope(input: {
  blocked: boolean;
  textLength: number;
  hasMetadata: boolean;
  failed?: boolean;
}): ArticleScope {
  if (input.failed) {
    return "failed";
  }
  if (input.blocked) {
    return "metadata_only";
  }
  if (input.textLength >= 400) {
    return "full";
  }
  if (input.textLength > 0) {
    return "partial";
  }
  return input.hasMetadata ? "metadata_only" : "failed";
}

export function scopeLabel(scope: string): string {
  switch (scope) {
    case "full":
      return "全文";
    case "partial":
      return "一部";
    case "metadata_only":
      return "概要のみ";
    case "failed":
      return "失敗";
    default:
      return "取得待ち";
  }
}
