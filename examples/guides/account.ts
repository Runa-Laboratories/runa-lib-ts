import { Runa } from "@runa_laboratories/sdk";

const runa = new Runa();
try {
  await runa.me();
} finally {
  await runa.close();
}
