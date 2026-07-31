import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "dist");
if (!output.startsWith(`${root}\\`) && !output.startsWith(`${root}/`)) {
  throw new Error("R-020-05: build output is outside the package root.");
}
rmSync(output, { recursive: true, force: true });
