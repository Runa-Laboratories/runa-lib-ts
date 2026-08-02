import { Runa } from "@runa_laboratories/sdk";

const runa = new Runa();
try {
  const session = await runa.sessions.get(process.env.RUNA_SESSION_ID ?? "");
  await session.checkpoint("before-change");
} finally {
  await runa.close();
}
