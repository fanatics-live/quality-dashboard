const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function isRetryable(err: unknown): boolean {
  if (err instanceof Error && "retryable" in err) {
    return (err as Error & { retryable?: boolean }).retryable === true;
  }
  // fetch network failures (DNS, reset, timeout) surface as TypeError
  return err instanceof TypeError;
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ATTEMPTS || !isRetryable(err)) throw err;
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
