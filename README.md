# setup-zig

[![test](https://github.com/xyzzylabs/setup-zig/actions/workflows/test.yml/badge.svg)](https://github.com/xyzzylabs/setup-zig/actions/workflows/test.yml)
[![CodeQL](https://github.com/xyzzylabs/setup-zig/actions/workflows/codeql.yml/badge.svg)](https://github.com/xyzzylabs/setup-zig/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 24](https://img.shields.io/badge/node-%E2%89%A524-43853d.svg)](https://nodejs.org/)

GitHub Action that installs the Zig compiler, verifies the download against
the official minisign signature, and caches the global Zig cache between
runs.

## Quickstart

```yaml
- uses: actions/checkout@v4
- uses: xyzzylabs/setup-zig@v1
- run: zig build test
```

That's it — no inputs needed. The action reads `minimum_zig_version` (or
`mach_zig_version`) from your `build.zig.zon` and installs that. If no
`build.zig.zon` is present it falls back to the latest stable release.

## Inputs

All inputs are optional.

| Name               | Default | What it does                                                                                                                                                              |
|--------------------|---------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `version`          | _auto_  | Explicit Zig version. Accepts `0.16.0`, `0.17.0-dev.123+abcdef012`, `2024.5.0-mach`, `master`, or `latest`. Overrides all auto-resolution.                                 |
| `zig-version-file` | _auto_  | Path to a file containing the version (`.zigversion`, `.tool-versions`, etc.). Plain string or `zig <version>` line accepted. Ignored when `version` is set.              |
| `mirror`           | _auto_  | Force a specific mirror, e.g. `https://pkg.machengine.org/zig`. Cannot be `https://ziglang.org`.                                                                          |
| `libc`             | `glibc` | Linux only: `glibc` or `musl`. Ignored on macOS / Windows.                                                                                                                |
| `use-cache`        | `true`  | Cache the global Zig cache directory between workflow runs.                                                                                                               |
| `cache-key`        | `''`    | Extra component appended to the cache key — set this when running a matrix that should partition the cache (target triple, optimize mode). OS is always part of the key. |
| `cache-size-limit` | `2048`  | Cache size cap in **MiB**. Cache is cleared when it exceeds this. `0` disables the cap.                                                                                  |
| `use-tool-cache`   | _auto_  | `true` / `false` override of the tool-cache decision. Defaults to `false` on GitHub-hosted runners and `true` elsewhere.                                                  |

## Outputs

| Name           | Example value                                       | What it means                                                                                                       |
|----------------|-----------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| `zig-version`  | `0.16.0`                                            | The version that was resolved and installed.                                                                        |
| `mirror-used`  | `https://pkg.machengine.org/zig`, `cache`, `tool-cache` | The mirror that served the tarball, or the cache layer that served the install.                                  |
| `cache-hit`    | `true` / `false`                                    | Whether Zig was served from a cache.                                                                                |

```yaml
- uses: xyzzylabs/setup-zig@v1
  id: zig
- run: echo "Using Zig ${{ steps.zig.outputs.zig-version }} (cache-hit=${{ steps.zig.outputs.cache-hit }})"
```

## Usage examples

### Pin to an exact version

```yaml
- uses: xyzzylabs/setup-zig@v1
  with:
    version: 0.16.0
```

### Read version from a file

```yaml
- uses: xyzzylabs/setup-zig@v1
  with:
    zig-version-file: .zigversion
```

### Musl tarballs on Alpine-style runners

```yaml
- uses: xyzzylabs/setup-zig@v1
  with:
    libc: musl
```

### Matrix with per-job cache scope

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [x86_64-linux, aarch64-linux, riscv64-linux]
        optimize: [Debug, ReleaseSafe]
    steps:
      - uses: actions/checkout@v4
      - uses: xyzzylabs/setup-zig@v1
        with:
          cache-key: ${{ matrix.target }}-${{ matrix.optimize }}
      - run: zig build -Dtarget=${{ matrix.target }} -Doptimize=${{ matrix.optimize }}
```

### Disable caching entirely

```yaml
- uses: xyzzylabs/setup-zig@v1
  with:
    use-cache: false
```

## Runner requirements

This action declares `using: 'node24'` and therefore needs a runner
that supports the Node 24 action runtime — that means
**Actions runner v2.327.0 or newer**. GitHub-hosted runners have
shipped this since mid-2025; self-hosted fleets pinned to an older
runner image will fail with `node24 is not a valid value for runs.using`
and need to be upgraded first.

## How it works

```
                       ┌─ randomized community mirror list
                       │  (cached for 6h in the actions cache)
1. Resolve version  ─→ 2. Pick 3 mirrors ─→ Promise.any race ─┐
                                                              ├─→ verify minisign ─→ extract
                       fallback: rest sequentially            │
                       last resort: ziglang.org canonical ────┘
```

On a cache hit, the cached tarball and its stored `.minisig` sidecar are
re-verified before the install is trusted. Per-mirror transient failures
(HTTP 5xx, abort, network reset) trigger one automatic retry with
jittered backoff; deterministic failures (signature mismatch, filename
mismatch) skip the retry.

The global Zig cache directory (`~/.cache/zig` on Linux) is cached
between runs, and `ZIG_LOCAL_CACHE_DIR` is redirected to the same path
so all caches benefit from cross-run preservation.

## Adding a mirror

The list of tarball mirrors lives in the
[community mirror list][mirrors] on ziglang.org. If you want to host a
mirror, see the [documentation][host-mirror] on the Zig website
repository — your mirror benefits any tool that follows the list, not
just this action.

## Security

- Every download is verified against the official Zig minisign key
  before extraction.
- Cached tarballs are re-verified on cache hit.
- The action makes no network calls beyond the resolved mirror, the
  community mirror list on `ziglang.org`, and the Actions cache
  backend; CI hardens egress with `harden-runner`.
- Vulnerabilities: see [SECURITY.md](SECURITY.md) for the private
  disclosure path.

## How this differs from `mlugg/setup-zig`

This project began as a fork of
[`mlugg/setup-zig`](https://codeberg.org/mlugg/setup-zig) and is now
maintained independently — we make our own design decisions and do not
backport changes from upstream. The substantive differences:

- **GitHub Actions only.** Forgejo Actions support and the related
  mirror notice are gone; the action targets the GitHub runner
  exclusively.
- **TypeScript on Node 24, no build step.** Sources are TypeScript under
  `src/`, run directly by Node's native type stripping. `tsgo` is used
  only for type checking; nothing is committed under `dist/`.
- **New inputs:** `zig-version-file` (read the version from
  `.zigversion` / `.tool-versions` / any file) and `libc` (`glibc` /
  `musl` on Linux runners).
- **New outputs:** `zig-version`, `mirror-used`, `cache-hit`.
- **Mirror racing with retry.** The first three mirrors are raced with
  `Promise.any`; per-mirror transient failures (HTTP 5xx, abort,
  network reset) get one jittered retry. Signature failures still
  short-circuit.
- **Cache-hit re-verification.** Cached tarballs are stored alongside
  their `.minisig` sidecar and re-verified before being trusted.
- **Streaming minisign hash.** Tarballs are hashed as they're read
  from disk rather than buffered into memory whole.
- **Real ZON reader.** A small hand-written parser replaces the regex,
  so comments and nested structs no longer confuse
  `minimum_zig_version` detection.
- **`dirSize` bug fix.** The post-step's directory walker now binds
  `err` in its inner `catch` — previously a `ReferenceError` masked
  the real per-file failure and the function returned size `0`,
  silently disabling the `cache-size-limit` check.

See [CHANGELOG.md](CHANGELOG.md) for the full changelog.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: edit
`src/*.ts`, run `npm run verify`, open a PR. There is no build step —
Node 24 runs the TypeScript source directly via native type stripping.

## License

MIT. See [LICENSE](LICENSE).

[mirrors]: https://ziglang.org/download/community-mirrors/
[host-mirror]: https://github.com/ziglang/www.ziglang.org/blob/main/MIRRORS.md
