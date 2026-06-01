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
 * Race the first `raceSize` items concurrently using Promise.any; on race-pool
 * exhaustion, fall back to sequential attempts on the remaining items. The
 * `attempt` callback is invoked once per item. Each invocation's outcome is
 * appended to `log` for reporting. The first successful attempt's value is
 * returned. Throws AllAttemptsFailedError if every item fails.
 *
 * `attempt` may throw or reject; the error message is captured into the log.
 */
export async function raceThenFallback<T>(
  items: readonly string[],
  raceSize: number,
  attempt: (item: string) => Promise<T>,
  log: AttemptOutcome[],
): Promise<RaceResult<T>> {
  if (items.length === 0) {
    throw new AllAttemptsFailedError('no items to attempt');
  }

  const race_pool = items.slice(0, Math.max(1, raceSize));
  const rest = items.slice(race_pool.length);

  // Race lane.
  if (race_pool.length > 1) {
    try {
      const winner = await Promise.any(race_pool.map((item) => runAttempt(item, attempt, log)));
      return { winner, via: 'race' };
    } catch {
      // All raced attempts failed; fall through to sequential.
    }
  } else {
    // Single-item "race" — just run it inline so the log lane is consistent.
    try {
      const winner = await runAttempt(race_pool[0]!, attempt, log);
      return { winner, via: 'race' };
    } catch {
      // continue
    }
  }

  // Sequential lane.
  for (const item of rest) {
    try {
      const winner = await runAttempt(item, attempt, log);
      return { winner, via: 'sequential' };
    } catch {
      // continue to next
    }
  }

  throw new AllAttemptsFailedError(`all ${items.length} attempts failed`);
}

async function runAttempt<T>(
  item: string,
  attempt: (item: string) => Promise<T>,
  log: AttemptOutcome[],
): Promise<T> {
  const t0 = Date.now();
  try {
    const value = await attempt(item);
    log.push({ item, ms: Date.now() - t0, status: 'ok' });
    return value;
  } catch (err) {
    log.push({ item, ms: Date.now() - t0, status: `fail: ${errMessage(err)}` });
    throw err;
  }
}
