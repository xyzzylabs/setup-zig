// Generic "race the first N, then sequentially try the rest" combinator.
// Lives in its own file so the semantics can be unit-tested with stub
// attempt functions, independent of real HTTP traffic.

import { errMessage } from './util.ts';

export interface AttemptOutcome {
  item: string;
  ms: number;
  status: string;
}

export interface RaceResult<T> {
  winner: T;
  // Indicates which lane found the winner so callers can label it.
  via: 'race' | 'sequential';
}

export class AllAttemptsFailedError extends Error {
  override readonly name = 'AllAttemptsFailedError';
}

/**
 * Race the first `raceSize` items concurrently using `Promise.any`; on
 * race-pool exhaustion, fall back to sequential attempts on the remaining
 * items. `attempt` is invoked once per item with that item's own
 * `AbortSignal`. When the race resolves, every other attempt's signal is
 * aborted so losers can stop their in-flight work (e.g. a download
 * `fetch`). Each invocation's outcome is appended to `log`. Throws
 * `AllAttemptsFailedError` if every item fails.
 */
export async function raceThenFallback<T>(
  items: readonly string[],
  raceSize: number,
  attempt: (item: string, signal: AbortSignal) => Promise<T>,
  log: AttemptOutcome[],
): Promise<RaceResult<T>> {
  if (items.length === 0) {
    throw new AllAttemptsFailedError('no items to attempt');
  }

  const race_pool = items.slice(0, Math.max(1, raceSize));
  const rest = items.slice(race_pool.length);

  // Race lane.
  if (race_pool.length > 1) {
    const controllers = race_pool.map(() => new AbortController());
    try {
      const winner = await Promise.any(race_pool.map((item, i) =>
        runAttempt(item, () => attempt(item, controllers[i]!.signal), log),
      ));
      // Cancel any still-running losers. Aborting an already-resolved
      // controller is a no-op, so we don't need to track which won.
      for (const c of controllers) c.abort();
      return { winner, via: 'race' };
    } catch {
      for (const c of controllers) c.abort();
      // All raced attempts failed; fall through to sequential.
    }
  } else {
    // Single-item "race" — just run it inline so the log lane is consistent.
    const controller = new AbortController();
    try {
      const winner = await runAttempt(race_pool[0]!, () => attempt(race_pool[0]!, controller.signal), log);
      return { winner, via: 'race' };
    } catch {
      controller.abort();
    }
  }

  // Sequential lane.
  for (const item of rest) {
    const controller = new AbortController();
    try {
      const winner = await runAttempt(item, () => attempt(item, controller.signal), log);
      return { winner, via: 'sequential' };
    } catch {
      controller.abort();
    }
  }

  throw new AllAttemptsFailedError(`all ${items.length} attempts failed`);
}

async function runAttempt<T>(
  item: string,
  thunk: () => Promise<T>,
  log: AttemptOutcome[],
): Promise<T> {
  const t0 = Date.now();
  try {
    const value = await thunk();
    log.push({ item, ms: Date.now() - t0, status: 'ok' });
    return value;
  } catch (err) {
    log.push({ item, ms: Date.now() - t0, status: `fail: ${errMessage(err)}` });
    throw err;
  }
}
