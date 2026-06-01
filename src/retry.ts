// Per-mirror retry with jittered backoff. Only retries failures classified
// as transient (HTTP 5xx, abort, network reset). Deterministic failures
// such as signature verification mismatches bypass the retry.

export class TransientError extends Error {
  override readonly name = 'TransientError';
}

export function isTransient(err: unknown): boolean {
  if (err instanceof TransientError) return true;
  if (!(err instanceof Error)) return false;
  // AbortError sets err.name; the message ("The operation was aborted") does
  // not mention "abort" in a way we can grep reliably across runtimes.
  if (err.name === 'AbortError') return true;
  const msg = err.message;
  // @actions/tool-cache and friends emit "Unexpected HTTP response: 5xx";
  // accept any non-digit run between "HTTP" and the status code.
  const http_match = /HTTP\D+(\d{3})/i.exec(msg);
  if (http_match) {
    const code = Number(http_match[1]);
    return code >= 500 && code < 600;
  }
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|socket hang up/i.test(msg);
}

export interface RetryOptions {
  /** Number of additional attempts after the first failure. Defaults to 1. */
  retries?: number;
  /** Minimum backoff in milliseconds. Defaults to 500. */
  minDelayMs?: number;
  /** Additional jitter window in milliseconds added on top of minDelayMs. Defaults to 500. */
  jitterMs?: number;
  /** Override the transient classifier (used by tests). */
  isTransient?: (err: unknown) => boolean;
  /** Override the sleep implementation (used by tests). */
  sleep?: (ms: number) => Promise<void>;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 1;
  const min_delay = opts.minDelayMs ?? 500;
  const jitter = opts.jitterMs ?? 500;
  const classify = opts.isTransient ?? isTransient;
  const sleep = opts.sleep ?? defaultSleep;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !classify(err)) throw err;
      attempt++;
      await sleep(min_delay + Math.floor(Math.random() * jitter));
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
