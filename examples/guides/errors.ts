import { ApiError, ConfigError, Runa } from "@runa_laboratories/sdk";

try {
  const runa = new Runa();
  try {
    await runa.me();
  } finally {
    await runa.close();
  }
} catch (error) {
  if (error instanceof ConfigError || error instanceof ApiError) {
    process.stderr.write(`${error.name}: ${error.code}\n`);
  }
}
