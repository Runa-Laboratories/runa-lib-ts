import { Runa } from "@runa_laboratories/sdk";

const runa = new Runa();
try {
  const session = await runa.sessions.create("first-session");
  await session.delete();
} finally {
  await runa.close();
}
