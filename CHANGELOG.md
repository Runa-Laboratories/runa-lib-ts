# Changelog

## 0.1.0 - Unreleased

SemVer class: initial minor release.

- Additions: initial ESM-only `@runa_laboratories/sdk` client, session and record managers, typed errors, deterministic resilience, and generated API reference.
- Additions: expose background session creation, default interactive Claude Code and Codex sessions to background provisioning, and document refresh-based readiness polling.
- Fixes: give `Session.authenticationStatus()` a dedicated 30-second attempt timeout without increasing the timeout of unrelated reads.
- Fixes: replace the non-GA license placeholder with the approved Apache-2.0 license and package metadata.
- Deprecations: none.
- Removals: none.
- Known limitations: general-availability publication remains blocked until the independent release authority is configured and admitted.
