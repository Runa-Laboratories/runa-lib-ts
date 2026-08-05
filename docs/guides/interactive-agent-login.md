# Interactive agent login

Claude Code and Codex sessions default to background provisioning because they
can use the user's provider subscription through an interactive login. The SDK
does not accept or embed a provider API key for this flow.

```ts
const session = await runa.sessions.create("interactive", {
  agent: "claude-code",
});

while (session.snapshot.status === "creating") {
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  await session.refresh();
}

const authentication = await session.authenticationStatus();
if (authentication.state === "login_required") {
  const handoff = await session.open();
  // Open handoff.url for the user. Never log, persist, or prefetch it.
}
```

The create call sends `background: true` automatically for `"claude-code"`
and `"codex"`. Pass `background: false` to request synchronous creation, or
set it explicitly for another agent. A background create may return status
`"creating"`; `refresh()` is the supported polling mechanism.

Synchronous creation can legitimately use the platform's 25-minute durable
provisioning lease and its five-minute recovery window. The SDK therefore
allows 31 minutes for `sessions.create` before timing out. Prefer the default
background flow for interactive agents so callers receive a session handle
immediately.
