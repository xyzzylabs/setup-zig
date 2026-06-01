# Security policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for vulnerabilities. Use
GitHub's [private security advisory][advisory] form on this repository
instead. We aim to acknowledge reports within 72 hours.

[advisory]: https://github.com/xyzzylabs/setup-zig/security/advisories/new

When reporting, please include:

- A description of the issue and the impact you observe.
- A minimal reproduction (workflow snippet, runner OS, Zig version).
- Whether the issue reproduces without the `mirror:` input set (helps
  us tell mirror-specific issues apart from action bugs).

## Mirror trust model

The action downloads tarballs from third-party community mirrors but
does not trust them. Every download is verified against the official
Zig minisign public key before extraction, and the signature's trusted
comment is matched against the exact filename we asked for — so a
mirror cannot serve a stale-but-validly-signed tarball in response to a
different request. Cached tarballs are re-verified on cache hit using
the stored `.minisig` sidecar.

What the model **does not** cover:

- **Replay of an older signed nightly.** For dev builds, a mirror could
  replay an older signed nightly that matches the requested filename.
  For real releases this is impossible (we request a specific version
  by name); for nightlies the worst case is "you got a slightly older
  valid build than expected."
- **Privacy.** Mirror operators see your runner IP, the requested
  version, and a `source=setup-zig/<version>` tag we send for
  attribution.
- **CA trust.** We rely on the system trust store for HTTPS to
  ziglang.org and to each mirror. A compromised CA could intercept the
  connection, but the minisign signature would still catch any
  tarball tampering.

## Scope

In scope:

- Tarball integrity or minisign verification bypasses.
- Cache poisoning or path-traversal vulnerabilities in extraction.
- Code injection via action inputs.
- Privilege escalation via the post-step.

Out of scope:

- Vulnerabilities in the Zig compiler itself — report those to
  [ziglang/zig](https://github.com/ziglang/zig).
- Issues in third-party mirrors not under our control.
- Denial of service against `ziglang.org` or community mirrors.

## Hardening checklist for consumers

- Pin this action by commit SHA, not by mutable tag, in workflows that
  handle secrets.
- Set `permissions:` explicitly in your workflow; this action only
  requires `contents: read`.
- If you use the `mirror:` input, point it at a host you control or
  trust.

## Maintainer follow-ups

- The CI workflows currently run `step-security/harden-runner` with
  `egress-policy: audit`. After the first few real runs against
  ziglang.org and the community mirrors, the egress allowlist should be
  populated and the policy flipped to `block` so any unexpected
  outbound connection from a transitive dependency becomes a hard
  failure.
