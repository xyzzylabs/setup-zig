import test from 'node:test';
import assert from 'node:assert/strict';
import { raceThenFallback, AllAttemptsFailedError, type AttemptOutcome } from '../src/race.ts';

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise(r => setTimeout(() => r(value), ms));
}
function reject(ms: number, msg: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));
}

test('race: fastest of the top-N wins, slow one does not delay the result', async () => {
  const log: AttemptOutcome[] = [];
  const start = Date.now();
  const { winner, via } = await raceThenFallback(
    ['slow', 'fast', 'medium', 'never-tried'],
    3,
    async (item) => {
      if (item === 'fast') return await delay(20, 'fast-value');
      if (item === 'medium') return await delay(150, 'medium-value');
      if (item === 'slow') return await delay(300, 'slow-value');
      throw new Error(`should not be attempted: ${item}`);
    },
    log,
  );
  const elapsed = Date.now() - start;
  assert.equal(winner, 'fast-value');
  assert.equal(via, 'race');
  // Must be much closer to 20ms than 300ms.
  assert.ok(elapsed < 200, `expected < 200ms, got ${elapsed}ms`);
  // 'never-tried' must not appear in the log because it is outside the race window.
  assert.ok(!log.some(e => e.item === 'never-tried'));
});

test('race: all race-pool members fail, sequential picks up the winner', async () => {
  const log: AttemptOutcome[] = [];
  const { winner, via } = await raceThenFallback(
    ['bad1', 'bad2', 'bad3', 'good'],
    3,
    async (item) => {
      if (item.startsWith('bad')) throw new Error(`${item} broken`);
      return `${item}-value`;
    },
    log,
  );
  assert.equal(winner, 'good-value');
  assert.equal(via, 'sequential');
  // All four items should have been logged: 3 failures + 1 success.
  assert.equal(log.length, 4);
  assert.equal(log.filter(e => e.status === 'ok').length, 1);
});

test('race: single-item race pool falls back to sequential on failure', async () => {
  const log: AttemptOutcome[] = [];
  const { winner, via } = await raceThenFallback(
    ['lonely', 'backup'],
    1,
    async (item) => {
      if (item === 'lonely') throw new Error('lonely failed');
      return `${item}-value`;
    },
    log,
  );
  assert.equal(winner, 'backup-value');
  assert.equal(via, 'sequential');
});

test('race: every attempt fails, throws AllAttemptsFailedError', async () => {
  const log: AttemptOutcome[] = [];
  await assert.rejects(
    raceThenFallback(['a', 'b', 'c'], 2, () => Promise.reject(new Error('nope')), log),
    AllAttemptsFailedError,
  );
  // All 3 must have been tried (2 raced + 1 sequential)
  assert.equal(log.length, 3);
  assert.ok(log.every(e => e.status.startsWith('fail:')));
});

test('race: empty input throws AllAttemptsFailedError immediately', async () => {
  const log: AttemptOutcome[] = [];
  await assert.rejects(
    raceThenFallback([], 3, async () => 'x', log),
    AllAttemptsFailedError,
  );
  assert.equal(log.length, 0);
});

test('race: outcome log includes duration measurements', async () => {
  const log: AttemptOutcome[] = [];
  await raceThenFallback(
    ['a'],
    1,
    async () => await delay(30, 'ok'),
    log,
  );
  assert.equal(log.length, 1);
  assert.equal(log[0]!.status, 'ok');
  assert.ok(log[0]!.ms >= 25, `expected ms >= 25, got ${log[0]!.ms}`);
});

test('race: race pool exhausts even when some succeed late, fastest still wins', async () => {
  // Promise.any returns on first success, but losers still run.
  // Make sure the loser eventually finishing doesn't leak into the winner result.
  const log: AttemptOutcome[] = [];
  const { winner } = await raceThenFallback(
    ['a', 'b'],
    2,
    async (item) => {
      if (item === 'a') return await delay(10, 'a-value');
      return await reject(100, 'b late fail');
    },
    log,
  );
  assert.equal(winner, 'a-value');
  // Wait for the lingering loser to settle so it doesn't pollute subsequent tests.
  await new Promise(r => setTimeout(r, 120));
});
