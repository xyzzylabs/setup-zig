import test from 'node:test';
import assert from 'node:assert/strict';
import { withRetry, isTransient, TransientError } from '../src/retry.ts';

// Instant resolve replacement for the sleep injection point, so the
// retry path runs without actually waiting.
const noSleep = () => Promise.resolve();

test('isTransient: TransientError is always transient', () => {
  assert.equal(isTransient(new TransientError('boom')), true);
});

test('isTransient: HTTP 5xx in message is transient', () => {
  assert.equal(isTransient(new Error('Unexpected HTTP response: 502 from mirror')), true);
  assert.equal(isTransient(new Error('Unexpected HTTP response: 599 from mirror')), true);
});

test('isTransient: HTTP 4xx in message is NOT transient', () => {
  assert.equal(isTransient(new Error('Unexpected HTTP response: 404 from mirror')), false);
  assert.equal(isTransient(new Error('Unexpected HTTP response: 403 from mirror')), false);
});

test('isTransient: HTTP 3xx is NOT transient', () => {
  assert.equal(isTransient(new Error('Unexpected HTTP response: 301 redirect')), false);
});

test('isTransient: common network errnos are transient', () => {
  for (const name of ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED']) {
    assert.equal(isTransient(new Error(`got ${name} on connect`)), true, `expected ${name} transient`);
  }
  assert.equal(isTransient(new Error('socket hang up')), true);
  const aborted = new Error('The operation was aborted');
  aborted.name = 'AbortError';
  assert.equal(isTransient(aborted), true);
});

test('isTransient: arbitrary application error is NOT transient', () => {
  assert.equal(isTransient(new Error('signature verification failed')), false);
  assert.equal(isTransient(new Error('filename mismatch')), false);
});

test('isTransient: non-Error values are not transient', () => {
  assert.equal(isTransient('boom'), false);
  assert.equal(isTransient(undefined), false);
  assert.equal(isTransient(null), false);
  assert.equal(isTransient({ message: 'fake' }), false);
});

test('withRetry: succeeds on first attempt without retrying', async () => {
  let calls = 0;
  const value = await withRetry(async () => { calls++; return 'ok'; }, { sleep: noSleep });
  assert.equal(value, 'ok');
  assert.equal(calls, 1);
});

test('withRetry: retries transient failures once and returns the recovered value', async () => {
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls++;
      if (calls === 1) throw new TransientError('temporary');
      return 'recovered';
    },
    { sleep: noSleep },
  );
  assert.equal(value, 'recovered');
  assert.equal(calls, 2);
});

test('withRetry: does NOT retry non-transient errors', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new Error('signature verification failed');
      },
      { sleep: noSleep },
    ),
    /signature verification failed/,
  );
  assert.equal(calls, 1);
});

test('withRetry: propagates the final error when retries are exhausted', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw new TransientError(`attempt ${calls}`);
      },
      { sleep: noSleep, retries: 2 },
    ),
    /attempt 3/,
  );
  assert.equal(calls, 3);
});

test('withRetry: honours custom classifier', async () => {
  let calls = 0;
  // Marks every error as transient — should retry once and then throw.
  await assert.rejects(
    withRetry(
      async () => { calls++; throw new Error('whatever'); },
      { sleep: noSleep, retries: 1, isTransient: () => true },
    ),
  );
  assert.equal(calls, 2);
});

test('withRetry: invokes sleep with delay in expected range', async () => {
  const delays: number[] = [];
  let calls = 0;
  await withRetry(
    async () => {
      calls++;
      if (calls === 1) throw new TransientError('one');
      return 'ok';
    },
    {
      sleep: (ms) => { delays.push(ms); return Promise.resolve(); },
      minDelayMs: 100,
      jitterMs: 50,
    },
  );
  assert.equal(delays.length, 1);
  assert.ok(delays[0]! >= 100 && delays[0]! < 150, `delay ${delays[0]} not in [100, 150)`);
});
