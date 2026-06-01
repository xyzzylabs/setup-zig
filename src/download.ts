// Streaming HTTP downloader with proper cancellation semantics.
//
// Replaces `@actions/tool-cache`'s `downloadTool` for the tarball leg so
// that race losers can stop fetching the moment a winner is decided —
// `downloadTool` does not accept an AbortSignal, which is why we go
// straight to `fetch` + `pipeline` here.
//
// Non-2xx responses raise an error. 5xx specifically is wrapped as a
// `TransientError` so the surrounding `withRetry` will treat it as
// retryable.

import * as path from 'node:path';
import { createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import * as crypto from 'node:crypto';
import { TransientError } from './retry.ts';
import { requireEnv } from './util.ts';

export interface DownloadOptions {
  /** URL to fetch. */
  url: string;
  /** Caller-provided abort signal. Combined with the internal timeout. */
  signal?: AbortSignal;
  /** Per-request timeout in milliseconds. Defaults to 120s. */
  timeoutMs?: number;
}

/**
 * Stream the body of `url` to a fresh file under `$RUNNER_TEMP` and
 * return the path. Honors `signal` end-to-end: when fired (either by the
 * caller or by the internal timeout) the in-flight download is cancelled
 * and any partially-written file is removed.
 */
export async function downloadToTempFile(opts: DownloadOptions): Promise<string> {
  const url = opts.url;
  const timeout_ms = opts.timeoutMs ?? 120_000;

  // Cancel either when the caller aborts OR when the timeout fires.
  const timeout_signal = AbortSignal.timeout(timeout_ms);
  const signal: AbortSignal = opts.signal
    ? AbortSignal.any([opts.signal, timeout_signal])
    : timeout_signal;

  const dest = path.join(
    requireEnv('RUNNER_TEMP'),
    `setup-zig-${crypto.randomBytes(8).toString('hex')}`,
  );

  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    const msg = `HTTP ${resp.status} for ${url}`;
    if (resp.status >= 500 && resp.status < 600) throw new TransientError(msg);
    throw new Error(msg);
  }
  if (!resp.body) throw new Error(`empty body for ${url}`);

  try {
    await pipeline(Readable.fromWeb(resp.body), createWriteStream(dest));
  } catch (err) {
    // Best-effort cleanup of the partially-written file.
    try { await fs.unlink(dest); } catch { /* ignore */ }
    throw err;
  }
  return dest;
}
