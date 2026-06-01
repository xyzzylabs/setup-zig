import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSizeLimitBytes } from '../src/cache-size.ts';

const MIB = 1024 * 1024;

test('parseSizeLimitBytes: empty / undefined falls back to 2048 MiB', () => {
  assert.equal(parseSizeLimitBytes(''), 2048 * MIB);
  assert.equal(parseSizeLimitBytes(undefined), 2048 * MIB);
});

test('parseSizeLimitBytes: positive integer parses to MiB * 1024^2', () => {
  assert.equal(parseSizeLimitBytes('4096'), 4096 * MIB);
  assert.equal(parseSizeLimitBytes('1'), 1 * MIB);
});

test('parseSizeLimitBytes: 0 means unlimited (no enforcement)', () => {
  assert.equal(parseSizeLimitBytes('0'), 0);
});

test('parseSizeLimitBytes: leading/trailing whitespace is tolerated', () => {
  assert.equal(parseSizeLimitBytes('  512  '), 512 * MIB);
});

test('parseSizeLimitBytes: rejects non-numeric input loudly', () => {
  assert.throws(() => parseSizeLimitBytes('huge'), /cache-size-limit/);
  assert.throws(() => parseSizeLimitBytes('NaN'), /cache-size-limit/);
});

test('parseSizeLimitBytes: rejects floats (silent truncation would be surprising)', () => {
  assert.throws(() => parseSizeLimitBytes('1.5'), /cache-size-limit/);
});

test('parseSizeLimitBytes: rejects negatives', () => {
  assert.throws(() => parseSizeLimitBytes('-1'), /cache-size-limit/);
  assert.throws(() => parseSizeLimitBytes('-2048'), /cache-size-limit/);
});

test('parseSizeLimitBytes: rejects values with trailing garbage', () => {
  // Number.parseInt would accept "2048MB" silently as 2048; we don't.
  assert.throws(() => parseSizeLimitBytes('2048MB'), /cache-size-limit/);
  assert.throws(() => parseSizeLimitBytes('2048 MB'), /cache-size-limit/);
});

test('parseSizeLimitBytes: error message echoes the bad input', () => {
  try {
    parseSizeLimitBytes('huge');
    assert.fail('expected throw');
  } catch (err) {
    assert.match((err as Error).message, /'huge'/);
  }
});
