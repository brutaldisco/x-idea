export function nextBackfillCursor(nextToken: string | null): {
  token: string | null;
  exhausted: boolean;
} {
  if (!nextToken) {
    return { token: null, exhausted: true };
  }
  return { token: nextToken, exhausted: false };
}
