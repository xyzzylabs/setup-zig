# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-06-01

Initial release as an independent project. The codebase originated as a
fork but has diverged significantly and is no longer tracking any other
repository. Highlights:

### Added

- `zig-version-file` input: read the version from any file (`.zigversion`,
  `.tool-versions`, etc.).
- `libc` input: select `glibc` or `musl` tarballs on Linux runners.
- `zig-version`, `mirror-used`, and `cache-hit` step outputs.
- `branding:` block so the marketplace listing renders with an icon and
  color.
- TypeScript codebase, ESM end-to-end (`"type": "module"`). Node 24's
  native TypeScript stripping runs `src/main.ts` directly — there is no
  build step and no committed `dist/`. [tsgo][tsgo]
  (`@typescript/native-preview`) is used only for type checking
  (`tsgo --noEmit`).
- Bundled fallback mirror list at `data/fallback-mirrors.json`.
- Job summary table listing every mirror attempt, status, and duration.
- `restore-keys` on the global Zig cache so PR builds warm from main.
- Mirror-list response cached under the actions cache (6 hour TTL).
- Top-3 mirrors are raced in parallel (`Promise.any`) before sequential
  fallback.
- Real ZON value extractor (`src/zon.ts`); comments and nested structs no
  longer confuse `minimum_zig_version` detection.
- Streaming BLAKE2b hash for minisign verification.
- Cached tarballs are re-verified against their stored `.minisig` sidecar
  before being trusted.
- Defensive JSON shape checks on `ziglang.org/index.json` and the Mach
  versions JSON.
- 5 second timeout on the mirror list fetch.
- Workflow name included in cache key so two callers of the same reusable
  workflow do not share a cache scope.
- `engines: { node: ">=24" }` in `package.json`.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, Renovate config,
  CodeQL workflow.
- CI hardening: every job uses `step-security/harden-runner`, every
  workflow has explicit `permissions:` and a `concurrency` group, every
  third-party action is pinned by commit SHA with a version comment.
- `.editorconfig`, `.npmrc` (engine-strict).
- Unit tests under `test/` using `node:test` and Node 24's native
  TypeScript type stripping (no transform step for tests). Coverage:
  `parseVersion`, `versionLessThan`, `getTarballName`, ZON parsing + a
  round-trip property test over printable strings, minisign roundtrip
  with synthetic keys, schema validators, and race-then-fallback
  semantics (fast wins, all-fail sequential fallback, error path).
- Dedicated mirror-race helper at `src/race.ts` (generic
  `raceThenFallback`) and schema validators at `src/schema.ts` for the
  JSON shapes we consume.
- Per-mirror automatic retry with jittered backoff on transient
  failures (5xx, abort, network reset). Deterministic failures
  (signature mismatch, filename mismatch) skip the retry.
- `.gitignore`.

### Changed

- Action runtime is `node24` (Node 20 is deprecated by GitHub Actions; EOL
  April 2026).
- `?source=` query tag is derived from `package.json` (`setup-zig/<version>`)
  rather than hardcoded.
- Mirror URL parsing uses `new URL()` and a case-insensitive host check.
- `cache-size-limit` is validated; non-numeric or negative values fail loudly.
- Minisign signature fetch checks `response.ok` and falls through on HTTP
  errors instead of attempting to parse the error body.

### Fixed

- The `dirSize` helper in `post.ts` now binds `err` in its inner `catch`.
  Previously every per-file stat failure threw `ReferenceError`, the real
  error was masked, and the function returned `0`, causing the
  `cache-size-limit` check to silently never fire when any file was
  unstatable.

### Removed

- Forgejo Actions support and the related mirror notice.

[tsgo]: https://github.com/microsoft/typescript-go
