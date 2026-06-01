import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseZigVersionsIndex,
  parseMachVersionsIndex,
  lookupMachVersion,
  SchemaError,
} from '../src/schema.ts';

test('parseZigVersionsIndex: extracts master and release versions', () => {
  const json = {
    master: { version: '0.15.0-dev.123+abcd' },
    '0.13.0': { date: '2024-06-07' },
    '0.14.0': { date: '2025-03-05' },
  };
  const out = parseZigVersionsIndex(json, 'test');
  assert.equal(out.master.version, '0.15.0-dev.123+abcd');
  assert.equal(out.releases.size, 2);
  assert.ok(out.releases.has('0.13.0'));
  assert.ok(out.releases.has('0.14.0'));
});

test('parseZigVersionsIndex: rejects non-object top level', () => {
  assert.throws(() => parseZigVersionsIndex(null, 'test'), SchemaError);
  assert.throws(() => parseZigVersionsIndex('hello', 'test'), SchemaError);
  assert.throws(() => parseZigVersionsIndex([], 'test'), SchemaError);
});

test('parseZigVersionsIndex: requires master.version string', () => {
  assert.throws(() => parseZigVersionsIndex({}, 'test'), SchemaError);
  assert.throws(() => parseZigVersionsIndex({ master: {} }, 'test'), SchemaError);
  assert.throws(() => parseZigVersionsIndex({ master: { version: 1 } }, 'test'), SchemaError);
});

test('parseMachVersionsIndex: parses well-formed entries', () => {
  const json = {
    '2024.5.0-mach': { version: '0.13.0', date: '2024-06-01' },
    '2024.10.0-mach': { version: '0.14.0' },
  };
  const out = parseMachVersionsIndex(json, 'test');
  assert.equal(out.size, 2);
  assert.equal(out.get('2024.5.0-mach')?.version, '0.13.0');
});

test('parseMachVersionsIndex: skips malformed entries instead of failing', () => {
  const json = {
    '2024.5.0-mach': { version: '0.13.0' },
    'broken': 'not an object',
    'also-broken': { date: '2024-01-01' }, // missing version
  };
  const out = parseMachVersionsIndex(json, 'test');
  assert.equal(out.size, 1);
});

test('parseMachVersionsIndex: rejects non-object top level', () => {
  assert.throws(() => parseMachVersionsIndex(null, 'test'), SchemaError);
});

test('lookupMachVersion: returns the version string', () => {
  const map = new Map([['2024.5.0-mach', { version: '0.13.0' }]]);
  assert.equal(lookupMachVersion(map, '2024.5.0-mach', 'test'), '0.13.0');
});

test('lookupMachVersion: throws SchemaError on missing key', () => {
  const map = new Map<string, { version: string }>();
  assert.throws(() => lookupMachVersion(map, 'unknown', 'test'), SchemaError);
});

test('SchemaError carries the source label', () => {
  try {
    parseZigVersionsIndex(null, 'https://ziglang.org/download/index.json');
    assert.fail('expected throw');
  } catch (err) {
    assert.ok(err instanceof SchemaError);
    assert.equal(err.source, 'https://ziglang.org/download/index.json');
    assert.match(err.message, /\[https:\/\/ziglang\.org/);
  }
});
