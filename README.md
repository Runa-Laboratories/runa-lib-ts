# @runa_laboratories/sdk

The official, ESM-only TypeScript client for the Runa API. Node.js 22 or
newer is required.

## Install

```sh
npm install @runa_laboratories/sdk
```

Set `RUNA_API_KEY` or pass an API key directly:

```ts
import { Runa, stdoutText } from "@runa_laboratories/sdk";

const runa = new Runa({ apiKey: process.env.RUNA_API_KEY });

try {
  const session = await runa.sessions.create("first-session", {
    agent: "codex",
  });
  const result = await session.exec(["printf", "%s", "hello"]);
  process.stdout.write(stdoutText(result));
  await session.delete();
} finally {
  await runa.close();
}
```

Configuration precedence is constructor options, environment variables, the
optional configuration file, then the default API endpoint. A present but
invalid higher-precedence value is an error; it never falls through.

## Resources

- `runa.sessions.create(name, options)`, `list()`, and `get(id)`
- `Session` lifecycle methods, `exec()`, `checkpoint()`, `authenticationStatus()`, and `open()`
- `runa.records.list()`
- `runa.me()`

`Session.open()` returns a short-lived sensitive value. Use it only for the
immediate handoff and do not print, persist, cache, or fetch it automatically.
`Session.authenticationStatus()` returns only the selected agent, method, and
strict state; it never returns terminal output, account identity, or secrets.

Session creation accepts `outboundPolicy` with mode `"allowlist"` or
`"denylist"` and up to 128 exact or leading-wildcard domains. An empty list is
explicit. The legacy `allowedHosts` option remains supported but cannot be sent
together with `outboundPolicy`. See the [network policy guide](docs/guides/network-policy.md).

See [guides](docs/guides/README.md) and the generated
[API reference](docs/api/README.md). Public errors have fixed safe messages:
`ConfigError`, `ApiError`, and the non-constructible `CommandError` marker.

## Development

```sh
npm ci
npm run quality
npm pack --dry-run
```

The package has no runtime dependencies and exposes only its root ESM entry.

## License

Copyright 2026 Runa Laboratories. Licensed under the
[Apache License 2.0](LICENSE).
