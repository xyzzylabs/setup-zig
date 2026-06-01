// Minimal runtime shape validators for the JSON we fetch from third-party
// sources. We don't need a full schema library — just consistent error
// messages and narrow types at the boundary.

export class SchemaError extends Error {
  override readonly name = 'SchemaError';
  readonly source: string;
  constructor(message: string, source: string) {
    super(`[${source}] ${message}`);
    this.source = source;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface ZigVersionsIndex {
  master: { version: string };
  releases: Map<string, unknown>;
}

// https://ziglang.org/download/index.json — keys are 'master' and release
// versions like '0.13.0'; each entry is an object with at least { version }.
export function parseZigVersionsIndex(raw: unknown, source: string): ZigVersionsIndex {
  if (!isObject(raw)) {
    throw new SchemaError('expected top-level object', source);
  }
  const master = raw['master'];
  if (!isObject(master) || typeof master['version'] !== 'string') {
    throw new SchemaError("missing or malformed 'master.version'", source);
  }
  const releases = new Map<string, unknown>();
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'master') continue;
    releases.set(key, value);
  }
  return { master: { version: master['version'] }, releases };
}

export interface MachVersionEntry {
  version: string;
}

// https://pkg.machengine.org/zig/index.json — each Mach nominated key maps to
// an object that includes a `version` string pointing at a Zig version.
export function parseMachVersionsIndex(
  raw: unknown,
  source: string,
): Map<string, MachVersionEntry> {
  if (!isObject(raw)) {
    throw new SchemaError('expected top-level object', source);
  }
  const out = new Map<string, MachVersionEntry>();
  for (const [key, value] of Object.entries(raw)) {
    if (!isObject(value) || typeof value['version'] !== 'string') {
      // Skip malformed entries rather than failing the whole fetch — the upstream
      // file occasionally lists keys with non-version metadata.
      continue;
    }
    out.set(key, { version: value['version'] });
  }
  return out;
}

export function lookupMachVersion(
  map: Map<string, MachVersionEntry>,
  key: string,
  source: string,
): string {
  const entry = map.get(key);
  if (!entry) {
    throw new SchemaError(`Mach nominated version '${key}' not found`, source);
  }
  return entry.version;
}
