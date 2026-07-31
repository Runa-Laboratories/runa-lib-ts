# Contributing

## Branches

- `main` — released, deployable truth. Protected.
- `develop/sdk-foundation` — integration. Feature branches (`feat/…`, `fix/…`)
  merge here; `main` receives it when a release is cut.

## Ground rules

- English only, in code, comments, docs, and commit messages.
- The SDK talks only to the Runa endpoint (`https://api.runacode.io` by
  default). It must never reference or reach an upstream service directly, and must never
  print a `runa_sk_` key.
- Every change follows the product requirements document it implements.
- Types pass, build is green, and tests cover the change before review.
