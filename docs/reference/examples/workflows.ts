import { Runa } from "@runa/sdk";
import type { Session } from "@runa/sdk";

declare const runa: Runa;
declare const session: Session;
declare const sessionId: string;

// example:runa-constructor
const client = new Runa({ apiKey: process.env.RUNA_API_KEY });
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
await runa.sessions.create("worker", { agent: "codex" });
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
