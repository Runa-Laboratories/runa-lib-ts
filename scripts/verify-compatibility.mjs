import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("evidence/compatibility-catalog.json", "utf8"));
const node = process.versions.node;
const npm = (process.platform === "win32"
  ? execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm --version"], { encoding: "utf8" })
  : execFileSync("npm", ["--version"], { encoding: "utf8" })
).trim();
const cell = catalog.cells.find((candidate) =>
  candidate.node === node && candidate.npm === npm &&
  candidate.platform === process.platform && candidate.arch === process.arch
);
const result = {
  schema_version: 1,
  catalog: catalog.catalog,
  revision: catalog.revision,
  status: cell === undefined ? "BLOCKED" : "PASS",
  cell_id: cell?.id ?? null,
  runtime: { node, npm, platform: process.platform, arch: process.arch }
};
await writeFile("evidence/compatibility-current.json", `${JSON.stringify(result, null, 2)}\n`);
if (cell === undefined) {
  console.error("compatibility: BLOCKED (runtime is not an exact V1 matrix cell)");
  process.exit(2);
}
console.log(`compatibility: PASS (${cell.id})`);
