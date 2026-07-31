# Session open handshake

`session.open()` returns a sensitive, short-lived value. Hand it directly to
the intended trusted consumer. Never print, persist, cache, inspect, reuse, or
fetch it automatically.

Source: [`examples/guides/session-open.ts`](../../examples/guides/session-open.ts).
