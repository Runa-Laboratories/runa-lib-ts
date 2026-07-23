<div align="center">

# @runa/sdk

**The TypeScript SDK for Runa — give agents the work, never the keys.**

</div>

---

Create Runa sessions, run commands inside them, checkpoint their work, and read
the record — from TypeScript or JavaScript.

Runa exposes a REST API at `https://api.runacode.io`. This package is a small,
typed wrapper around it, so you can write:

```ts
import { Runa } from "@runa/sdk";

const runa = new Runa(); // reads RUNA_API_KEY from the environment

const session = await runa.sessions.create({ name: "hello", agent: "claude-code" });
try {
  const result = await session.exec("echo hello from runa");
  console.log(result.stdoutText);
} finally {
  await session.delete();
}
```

## Status

Early development. This repository is being built from the product requirements
documents in the workspace `prds/` folder. The public API is not yet stable.

## Authentication

Set a Runa API key:

```bash
export RUNA_API_KEY="runa_sk_..."
```

Requests go to `https://api.runacode.io` by default; override with
`new Runa({ baseUrl: "..." })` or `RUNA_BASE_URL`. Never commit a real key.

## Install

```bash
npm install @runa/sdk
```

## License

TODO — to be decided before the first public release.
