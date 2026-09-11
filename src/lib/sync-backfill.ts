/** X は max_results 未満のページで next_token を落とすことがあるため、小さいページで読み直す。 */
export const BACKFILL_PROBE_PAGE = 10;

export type BackfillStep =
  | { action: "continue"; token: string }
  | { action: "probe"; pageSize: number }
  | { action: "exhausted" };

/**
 * backfill の 1 ページごとの進め方を決める。
 * - token があれば進む
 * - token が無く 1 件以上取れたら、同じ位置を小さいページで読み直す（末尾かどうかを確かめる）
 * - 読み直しサイズでも token が無ければ末尾とみなす
 */
export function backfillStep(input: {
  nextToken: string | null | undefined;
  fetched: number;
  pageSize: number;
  probePageSize?: number;
}): BackfillStep {
  const probeSize = input.probePageSize ?? BACKFILL_PROBE_PAGE;
  const token =
    typeof input.nextToken === "string" && input.nextToken.trim()
      ? input.nextToken
      : null;
  if (token) {
    return { action: "continue", token };
  }
  if (input.fetched <= 0) {
    return { action: "exhausted" };
  }
  if (input.pageSize > probeSize) {
    return { action: "probe", pageSize: probeSize };
  }
  return { action: "exhausted" };
}

/** 今すぐ同期が途中で止まったときの next_token を、未開始の backfill に渡す。 */
export function leftoverBackfillCursor(input: {
  nextToken: string | null | undefined;
  alreadyExhausted: boolean;
  existingToken: string | null;
}): { token: string | null; exhausted: boolean } | null {
  if (input.alreadyExhausted || input.existingToken) {
    return null;
  }
  const token =
    typeof input.nextToken === "string" && input.nextToken.trim()
      ? input.nextToken
      : null;
  if (token) {
    return { token, exhausted: false };
  }
  return { token: null, exhausted: true };
}
