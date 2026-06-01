// Minimal Zig Object Notation reader for the subset setup-zig needs:
// extract top-level string-valued fields from `.{ .foo = "bar", ... }`.
//
// Nested structs/arrays are skipped (balanced braces/parens). Line comments
// are ignored. Multiline string literals (`\\foo`-prefixed lines) are
// supported because they appear in real build.zig.zon files for fields like
// `description`.
//
// Intentionally NOT a complete ZON parser. Goal: robust enough to find
// `minimum_zig_version` / `mach_zig_version` without being fooled by
// commented-out fields or strings containing braces.

export type ZonStruct = Record<string, string>;

export function parseTopLevelStruct(text: string): ZonStruct {
  const t = new Tokenizer(text);
  t.expect('.');
  t.expect('{');
  const fields: ZonStruct = {};
  for (;;) {
    t.skipTrivia();
    if (t.eat('}')) break;
    t.expect('.');
    const name = t.readIdent();
    t.skipTrivia();
    t.expect('=');
    t.skipTrivia();
    const value = readValue(t);
    if (typeof value === 'string') fields[name] = value;
    t.skipTrivia();
    t.eat(',');
  }
  return fields;
}

function readValue(t: Tokenizer): string | null {
  const c = t.peek();
  if (c === '"') return t.readString();
  if (c === '\\') return t.readMultilineString();
  if (c === '.') {
    t.next();
    if (t.peek() === '{') {
      t.next();
      t.skipBalanced('}');
      return null;
    }
    t.readIdent();
    return null;
  }
  if (c === '(') { t.next(); t.skipBalanced(')'); return null; }
  if (c === '[') { t.next(); t.skipBalanced(']'); return null; }
  while (!t.atEnd()) {
    const ch = t.peek();
    if (ch === ',' || ch === '}' || ch === ')' || ch === ']' || ch === '/') break;
    if (ch && /\s/.test(ch)) break;
    t.next();
  }
  return null;
}

class Tokenizer {
  private readonly text: string;
  private i = 0;
  constructor(text: string) { this.text = text; }

  atEnd(): boolean { return this.i >= this.text.length; }
  peek(): string | undefined { return this.text[this.i]; }
  next(): string | undefined { return this.text[this.i++]; }

  eat(ch: string): boolean {
    this.skipTrivia();
    if (this.text[this.i] === ch) { this.i++; return true; }
    return false;
  }

  expect(ch: string): void {
    this.skipTrivia();
    if (this.text[this.i] !== ch) {
      throw new Error(`ZON parse error at offset ${this.i}: expected '${ch}', got '${this.text[this.i] ?? 'EOF'}'`);
    }
    this.i++;
  }

  skipTrivia(): void {
    for (;;) {
      while (!this.atEnd()) {
        const c = this.text[this.i];
        if (c && /\s/.test(c)) { this.i++; } else break;
      }
      if (this.text[this.i] === '/' && this.text[this.i + 1] === '/') {
        while (!this.atEnd() && this.text[this.i] !== '\n') this.i++;
        continue;
      }
      break;
    }
  }

  readIdent(): string {
    const start = this.i;
    while (!this.atEnd()) {
      const c = this.text[this.i];
      if (c && /[A-Za-z0-9_]/.test(c)) this.i++; else break;
    }
    if (this.i === start) {
      throw new Error(`ZON parse error at offset ${this.i}: expected identifier`);
    }
    return this.text.slice(start, this.i);
  }

  readString(): string {
    if (this.text[this.i] !== '"') {
      throw new Error(`ZON parse error at offset ${this.i}: expected string`);
    }
    this.i++;
    let out = '';
    while (!this.atEnd() && this.text[this.i] !== '"') {
      const ch = this.text[this.i++];
      if (ch === '\\' && !this.atEnd()) {
        const esc = this.text[this.i++];
        switch (esc) {
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case '\\': out += '\\'; break;
          case '"': out += '"'; break;
          case "'": out += "'"; break;
          case 'x': {
            const hex = this.text.slice(this.i, this.i + 2);
            this.i += 2;
            out += String.fromCharCode(parseInt(hex, 16));
            break;
          }
          default: if (esc !== undefined) out += esc;
        }
      } else if (ch !== undefined) {
        out += ch;
      }
    }
    if (this.text[this.i] !== '"') {
      throw new Error(`ZON parse error: unterminated string starting before offset ${this.i}`);
    }
    this.i++;
    return out;
  }

  readMultilineString(): string {
    let out = '';
    while (this.text[this.i] === '\\' && this.text[this.i + 1] === '\\') {
      this.i += 2;
      const end = this.text.indexOf('\n', this.i);
      const stop = end === -1 ? this.text.length : end;
      out += this.text.slice(this.i, stop);
      this.i = stop;
      if (this.text[this.i] === '\n') this.i++;
      let j = this.i;
      while (j < this.text.length && (this.text[j] === ' ' || this.text[j] === '\t')) j++;
      if (this.text[j] === '\\' && this.text[j + 1] === '\\') {
        this.i = j;
        out += '\n';
      }
    }
    return out;
  }

  skipBalanced(close: string): void {
    const opens: Record<string, string> = { '}': '{', ')': '(', ']': '[' };
    const open = opens[close];
    if (!open) throw new Error(`internal: unknown close char ${close}`);
    let depth = 1;
    while (!this.atEnd() && depth > 0) {
      this.skipTrivia();
      const ch = this.text[this.i];
      if (ch === '"') { this.readString(); continue; }
      if (ch === '\\' && this.text[this.i + 1] === '\\') { this.readMultilineString(); continue; }
      if (ch === open) { depth++; this.i++; continue; }
      if (ch === close) { depth--; this.i++; continue; }
      this.i++;
    }
    if (depth !== 0) {
      throw new Error(`ZON parse error: unbalanced '${open}'/'${close}'`);
    }
  }
}
