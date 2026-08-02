import { Runa } from "@runa_laboratories/sdk";

const runa = new Runa();
try {
  await runa.records.list();
} finally {
  await runa.close();
}
