import { Runa } from "@runa/sdk";

const runa = new Runa();
try {
  await runa.me();
} finally {
  await runa.close();
}
