import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, versionLessThan, getTarballName, resetVersionCacheForTests } from '../src/common.ts';

test('parseVersion: stable release', () => {
  assert.deepEqual(parseVersion('0.13.0'), { major: 0, minor: 13, patch: 0, dev: null });
});

test('parseVersion: dev build', () => {
  assert.deepEqual(parseVersion('0.14.0-dev.351+64ef45eb0'), {
    major: 0, minor: 14, patch: 0, dev: 351,
  });
});

test('parseVersion: malformed returns null', () => {
  assert.equal(parseVersion('master'), null);
  assert.equal(parseVersion('1.2'), null);
  assert.equal(parseVersion(''), null);
});

test('versionLessThan: stable comparisons', () => {
  assert.equal(versionLessThan('0.13.0', '0.14.0'), true);
  assert.equal(versionLessThan('0.14.0', '0.14.0'), false);
  assert.equal(versionLessThan('0.14.1', '0.14.0'), false);
});

test('versionLessThan: dev < stable with same x.y.z', () => {
  assert.equal(versionLessThan('0.14.0-dev.351+abcdef0', '0.14.0'), true);
  assert.equal(versionLessThan('0.14.0', '0.14.0-dev.351+abcdef0'), false);
});

test('versionLessThan: dev vs dev ordered by counter', () => {
  assert.equal(versionLessThan('0.14.0-dev.100+aaaa', '0.14.0-dev.200+bbbb'), true);
  assert.equal(versionLessThan('0.14.0-dev.200+bbbb', '0.14.0-dev.100+aaaa'), false);
});

test('versionLessThan: malformed returns false', () => {
  assert.equal(versionLessThan('master', '0.14.0'), false);
  assert.equal(versionLessThan('0.14.0', 'master'), false);
});

test('getTarballName: respects version env input', async () => {
  process.env['INPUT_VERSION'] = '0.14.1';
  delete process.env['INPUT_ZIG-VERSION-FILE'];
  delete process.env['INPUT_LIBC'];
  resetVersionCacheForTests();
  try {
    const name = await getTarballName();
    assert.match(name, /^zig-[a-z0-9_]+-[a-z]+-0\.14\.1$/);
  } finally {
    delete process.env['INPUT_VERSION'];
    resetVersionCacheForTests();
  }
});

test('getTarballName: uses legacy ordering before 0.14.1', async () => {
  process.env['INPUT_VERSION'] = '0.14.0';
  delete process.env['INPUT_ZIG-VERSION-FILE'];
  delete process.env['INPUT_LIBC'];
  resetVersionCacheForTests();
  try {
    const name = await getTarballName();
    assert.match(name, /^zig-[a-z]+-[a-z0-9_]+-0\.14\.0$/);
  } finally {
    delete process.env['INPUT_VERSION'];
    resetVersionCacheForTests();
  }
});
