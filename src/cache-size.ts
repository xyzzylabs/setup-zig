// Input parsing for `cache-size-limit`. Accepts a non-negative integer
// in MiB; 0 means "no limit". An empty input falls back to the default.

const DEFAULT_LIMIT_MIB = 2048;

export function parseSizeLimitBytes(raw: string | undefined): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_LIMIT_MIB * 1024 * 1024;
  }
  const trimmed = String(raw).trim();
  const mib = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(mib) || mib < 0 || String(mib) !== trimmed) {
    throw new Error(
      `Invalid 'cache-size-limit' value: '${raw}' (expected a non-negative integer in MiB, or 0 for unlimited)`,
    );
  }
  return mib * 1024 * 1024;
}
