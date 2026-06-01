import test from 'node:test';
import assert from 'node:assert/strict';
import { withSource } from '../src/source-tag.ts';

test('withSource: appends ?source= when no query string present', () => {
  assert.equal(
    withSource('https://example.com/path/file.tar', 'setup-zig/1.0.0'),
    'https://example.com/path/file.tar?source=setup-zig%2F1.0.0',
  );
});

test('withSource: appends &source= when query string already present', () => {
  assert.equal(
    withSource('https://example.com/file.tar?token=abc', 'setup-zig/1.0.0'),
    'https://example.com/file.tar?token=abc&source=setup-zig%2F1.0.0',
  );
});

test('withSource: URL-encodes special characters in the tag', () => {
  assert.equal(
    withSource('https://example.com/x', 'setup-zig/1.0.0-rc.1+meta'),
    'https://example.com/x?source=setup-zig%2F1.0.0-rc.1%2Bmeta',
  );
});

test('withSource: empty tag passes URL through unchanged', () => {
  assert.equal(
    withSource('https://example.com/x?a=1', ''),
    'https://example.com/x?a=1',
  );
});

test('withSource: trailing slash and dotted path survive', () => {
  assert.equal(
    withSource('https://example.com/zig/0.13.0/', 'tag'),
    'https://example.com/zig/0.13.0/?source=tag',
  );
});
