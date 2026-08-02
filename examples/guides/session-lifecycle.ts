import { Runa } from "@runa_laboratories/sdk";

const runa = new Runa();
try {
  const session = await runa.sessions.create("lifecycle");
  await session.pause();
  await session.resume();
  await session.stop();
  await session.start();
  await session.refresh();
  await session.delete();
} finally {
  await runa.close();
}
