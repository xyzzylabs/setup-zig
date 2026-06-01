<!--
PR title format: Conventional Commits.
  feat:     a new feature
  fix:      a bug fix
  perf:     performance improvement
  refactor: code change that neither fixes a bug nor adds a feature
  docs:     documentation only
  deps:     dependency update
  build:    build system / tooling
  ci:       CI configuration
  test:     adding or correcting tests
  chore:    other (no user-facing change)

The PR title becomes the entry in CHANGELOG.md, so please make it
imperative and descriptive: `feat: add musl libc support on Linux`,
not `Added musl support`.
-->

## Summary

<!-- One or two sentences on what this PR does and why. -->

## Changes

<!-- A short list of the user-visible changes. Omit if it's a tiny diff. -->

## Verification

<!-- How you verified the change. At a minimum: -->

- [ ] `npm run verify` passes locally.
- [ ] New behavior is covered by a test (or, if not, a note in the
      summary explaining why).
- [ ] If touching workflows, ran `actionlint` locally (or relied on
      the CI lint job).
- [ ] If touching docs, links and code blocks still resolve.

## Notes for reviewers

<!-- Anything reviewers should know: design decisions, alternatives
considered, follow-ups planned for a separate PR, etc. -->
