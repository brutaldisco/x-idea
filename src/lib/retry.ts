export type RetryOptions = {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  retryOn?: (error: unknown) => boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function defaultShouldRetry(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: number }).status);
    return status === 429 || status >= 500;
  }
  return true;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseMs = options.baseMs ?? 400;
  const maxMs = options.maxMs ?? 8_000;
  const retryOn = options.retryOn ?? defaultShouldRetry;

  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === attempts - 1 || !retryOn(error)) {
        throw error;
      }
      const wait = Math.min(maxMs, baseMs * 2 ** i);
      const jitter = wait * (0.2 * Math.random());
      await sleep(wait + jitter);
    }
  }
  throw lastError;
}
