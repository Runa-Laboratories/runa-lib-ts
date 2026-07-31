import { Runa, stdoutText } from "@runa/sdk";

const runa = new Runa();
try {
  const session = await runa.sessions.get(process.env.RUNA_SESSION_ID ?? "");
  const result = await session.exec(["printf", "%s", "hello"], { timeoutSecs: 30 });
  process.stdout.write(stdoutText(result));
} finally {
  await runa.close();
}
