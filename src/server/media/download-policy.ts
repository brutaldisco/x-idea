export function shouldFetchMediaBlob(input: {
  hasBlob: boolean;
  status: string;
  force?: boolean;
}): boolean {
  if (input.hasBlob && !input.force) {
    return false;
  }
  if (input.status === "awaiting_confirm" || input.status === "skipped") {
    return Boolean(input.force);
  }
  return true;
}
