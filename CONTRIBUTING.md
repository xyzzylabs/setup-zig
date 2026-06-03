# Contributing

Thanks for your interest in contributing.

## Project direction

This project is independent. We make our own design decisions and do not
mirror or backport changes from any other repository. Please open issues
and pull requests here; we'll evaluate them on their own merits.

## Development

```sh
node --version       # >= 24
npm install          # installs runtime + tsgo + ncc + typescript devDeps
npm run typecheck    # tsgo --noEmit (fast project-wide typecheck)
npm test             # node --test 'test/*.test.ts' (Node native type stripping)
npm run build        # @vercel/ncc bundles src/main.ts and src/post.ts → dist/
npm run verify       # typecheck + tests + build (use before opening a PR)
```

The project source is **ESM** TypeScript (`"type": "module"`, source
files import with `import` / `export`). Tests run directly from
`src/*.ts` via Node 24's native type stripping — no transpile step
needed for tests.

The action runtime, by contrast, loads a **bundled** CommonJS or
ESM file from `dist/main/index.js` / `dist/post/index.js` — produced
by [`@vercel/ncc`][ncc] from the TypeScript source with every
transitive dependency inlined. The bundle is committed because GitHub
Actions runs the action straight from the checkout (no `npm install`
at runtime).

When editing source:

1. Change `src/*.ts`.
2. Run `npm run verify` — this rebuilds `dist/` as a side effect.
3. Commit both your `src/` changes **and** the regenerated `dist/`.

CI rejects PRs whose committed `dist/` differs from a fresh build.

[ncc]: https://github.com/vercel/ncc

## Tests

Tests use the built-in `node:test` runner with Node 24's native
TypeScript type stripping. They live under `test/` and cover:

- `parseVersion` / `versionLessThan` semantics.
- Tarball name generation for current and legacy naming schemes.
- ZON value extraction (including a round-trip property test over
  printable strings with escapes).
- Minisign signature parsing on synthetic Ed25519 keypairs.
- Schema validators for the ziglang.org and Mach versions JSON.
- The mirror race-then-fallback combinator.
- `withRetry` / `isTransient` classification and retry semantics.
- The `withSource` URL helper.
- `parseSizeLimitBytes` input validation.

Add tests for any new code path. CI runs the full suite on every PR
and uploads coverage to the job summary.

In addition to `node:test`, the lint workflow runs `actionlint`,
`typos`, `markdownlint-cli2`, and `actions/dependency-review-action`
on every PR. Run any of them locally with their respective CLIs (all
available via Homebrew) before pushing if you want fast feedback.

## Style

- TypeScript only for new code.
- No emoji in source or commit messages.
- Comments explain *why*, not *what*.
- Prefer `const`, arrow callbacks, and `async`/`await`.
- Keep diffs focused; do not bundle unrelated refactors.

### TypeScript discipline

`tsconfig.json` is intentionally strict. The compiler enforces:

- `strict` (everything in the strict family) plus
  `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noPropertyAccessFromIndexSignature`, and
  `exactOptionalPropertyTypes`.
- `erasableSyntaxOnly` — source must stay within the subset Node 24 can
  strip at load time. **No** enums, parameter properties, namespaces
  with values, or `import = require`. Use explicit field declarations,
  plain `const` objects, or `as const` unions instead.
- `verbatimModuleSyntax` and `isolatedModules` — every file must be
  independently strippable. Use `import type { … }` for type-only
  imports; avoid re-exporting types without the `type` modifier.

Conventions on top of the compiler:

- Use the `errMessage(err)` and `isErrnoException(err)` helpers from
  `src/util.ts` instead of inlining `err instanceof Error ? … : …`.
- Use `requireEnv('VAR')` to read runner-provided env vars instead of
  asserting them with `!`. Missing-env bugs should surface with a
  clear message at the call site.
- Avoid `!` (non-null assertions) and `as` casts. If TS can't see why
  something is safe, prefer an explicit `undefined` check or a
  user-defined type guard.
- Validate `unknown` payloads (JSON, action inputs) with a small
  schema validator (see `src/schema.ts`) before depending on shape.

## PR conventions

PR titles are linted as [Conventional Commits][cc] by CI. Allowed types:
`feat`, `fix`, `perf`, `refactor`, `docs`, `deps`, `build`, `ci`,
`test`, `chore`. The subject should start lower-case and be imperative:

> `feat: add musl libc support on Linux`

not

> `feat: Added musl support`

The PR title becomes the entry in `CHANGELOG.md` once
[release-please][rp] picks it up, so it should read as a changelog
line.

[cc]: https://www.conventionalcommits.org/en/v1.0.0/
[rp]: https://github.com/googleapis/release-please

## Release

Releases are managed by [release-please][rp]. On every push to `main`
it tallies conventional commits since the last release, opens (or
updates) a "Release PR" that bumps the version in `package.json` and
prepends a section to `CHANGELOG.md`. Merging that PR creates the
`vX.Y.Z` tag and a GitHub release, and a follow-up workflow
fast-forwards the floating `v1` tag to that commit. No manual
`npm version` / `git tag` dance.

If you need to ship a release without conventional-commit signals
(rare, e.g. a workflow-only change), push a commit with `Release-As:
X.Y.Z` in the footer or run the `release-please` workflow with
`workflow_dispatch`.
