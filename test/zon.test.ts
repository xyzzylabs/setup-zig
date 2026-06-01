import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTopLevelStruct } from '../src/zon.ts';

test('extracts minimum_zig_version', () => {
  const text = `
    .{
        .name = "myproj",
        .version = "0.0.1",
        .minimum_zig_version = "0.13.0",
        .paths = .{""},
    }
  `;
  const out = parseTopLevelStruct(text);
  assert.equal(out['minimum_zig_version'], '0.13.0');
  assert.equal(out['name'], 'myproj');
});

test('extracts mach_zig_version when present', () => {
  const text = `
    .{
        .name = "myproj",
        .mach_zig_version = "2024.5.0-mach",
        .minimum_zig_version = "0.13.0",
    }
  `;
  const out = parseTopLevelStruct(text);
  assert.equal(out['mach_zig_version'], '2024.5.0-mach');
  assert.equal(out['minimum_zig_version'], '0.13.0');
});

test('ignores commented-out version field', () => {
  const text = `
    .{
        // .minimum_zig_version = "9.9.9",
        .minimum_zig_version = "0.14.0",
    }
  `;
  const out = parseTopLevelStruct(text);
  assert.equal(out['minimum_zig_version'], '0.14.0');
});

test('handles nested struct in dependencies without confusion', () => {
  const text = `
    .{
        .name = "x",
        .dependencies = .{
            .some_dep = .{
                .url = "https://example.com/x.tar.gz",
                .hash = "1220abc",
                .minimum_zig_version = "0.99.0",
            },
        },
        .minimum_zig_version = "0.13.0",
    }
  `;
  const out = parseTopLevelStruct(text);
  assert.equal(out['minimum_zig_version'], '0.13.0');
});

test('handles strings containing braces', () => {
  const text = `
    .{
        .description = "weird { string } with braces",
        .minimum_zig_version = "0.14.1",
    }
  `;
  const out = parseTopLevelStruct(text);
  assert.equal(out['minimum_zig_version'], '0.14.1');
  assert.equal(out['description'], 'weird { string } with braces');
});

test('throws on truly malformed input', () => {
  assert.throws(() => parseTopLevelStruct('not a zon document'));
});

test('returns empty object for empty struct', () => {
  const out = parseTopLevelStruct('.{}');
  assert.deepEqual(out, {});
});

// Property-style round-trip: build a synthetic .zig.zon for a set of
// (key, value) pairs of arbitrary printable strings, then assert each
// pair we put in comes back out unchanged. Catches escape-sequence,
// hex-byte, embedded-quote, embedded-brace, and empty-value cases that
// the case-by-case tests above don't exercise.
test('round-trip: arbitrary printable string values survive parsing', () => {
  const fields: [string, string][] = [
    ['minimum_zig_version', '0.13.0'],
    ['mach_zig_version', '2024.5.0-mach'],
    ['name', 'has a space'],
    ['url', 'https://example.com/x.tar.gz?q=1&b=2'],
    ['hex_byte', 'a\x42b'],          // \x42 = 'B'
    ['newline', 'line1\nline2'],
    ['quote', 'with "double" quotes'],
    ['backslash', 'with \\ backslash'],
    ['braces', 'literal { and }'],
    ['empty', ''],
  ];

  const body = fields
    .map(([k, v]) => `        .${k} = "${encodeZonString(v)}",`)
    .join('\n');
  const text = `.{\n${body}\n    }`;

  const parsed = parseTopLevelStruct(text);
  for (const [k, v] of fields) {
    assert.equal(parsed[k], v, `field ${k} did not round-trip`);
  }
});

function encodeZonString(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x7f) {
      out += '\\x' + code.toString(16).padStart(2, '0');
    } else {
      out += ch;
    }
  }
  return out;
}
