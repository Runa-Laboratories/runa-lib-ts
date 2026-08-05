import { Runa } from "@runa_laboratories/sdk";
import type { Session } from "@runa_laboratories/sdk";

declare const runa: Runa;
declare const session: Session;
declare const sessionId: string;

// example:runa-constructor
const apiKey = process.env.RUNA_API_KEY;
if (apiKey === undefined) throw new Error("RUNA_API_KEY is required.");
const client = new Runa({ apiKey });
await client.close();
// end-example

// example:runa-me
await runa.me();
// end-example

// example:runa-close
await runa.close();
// end-example

// example:records-list
await runa.records.list();
// end-example

// example:sessions-create
const created = await runa.sessions.create("worker", { agent: "codex" });
if (created.snapshot.status === "creating") await created.refresh();
// end-example

// example:sessions-list
await runa.sessions.list();
// end-example

// example:sessions-get
await runa.sessions.get(sessionId);
// end-example

// example:session-refresh
await session.refresh();
// end-example

// example:session-start
await session.start();
// end-example

// example:session-pause
await session.pause();
// end-example

// example:session-resume
await session.resume();
// end-example

// example:session-stop
await session.stop();
// end-example

// example:session-delete
await session.delete();
// end-example

// example:session-exec
await session.exec(["printf", "%s", "ready"], { timeoutSecs: 30 });
// end-example

// example:session-checkpoint
await session.checkpoint("before-change");
// end-example

// example:session-open
await session.open();
// end-example

// example:session-authentication-status
const authentication = await session.authenticationStatus();
if (authentication.state === "login_required") {
  const handoff = await session.open();
  void handoff; // Pass to the user's browser; never log or persist it.
}
// end-example
