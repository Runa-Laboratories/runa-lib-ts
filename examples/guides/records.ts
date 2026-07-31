import { Runa } from "@runa/sdk";

const runa = new Runa();
try {
  await runa.records.list();
} finally {
  await runa.close();
}
