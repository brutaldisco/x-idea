export function nextBackfillCursor(
  nextToken: string | null | undefined,
  input: {
    fetched?: number;
    pageSize?: number;
    previousToken?: string | null;
  } = {},
): {
  token: string | null;
  exhausted: boolean;
} {
  const token =
    typeof nextToken === "string" && nextToken.trim() ? nextToken : null;
  if (token) {
    return { token, exhausted: false };
  }
  const fetched = input.fetched ?? 0;
  const pageSize = input.pageSize ?? 0;
  if (pageSize > 0 && fetched >= pageSize) {
    return { token: input.previousToken ?? null, exhausted: false };
  }
  return { token: null, exhausted: true };
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
