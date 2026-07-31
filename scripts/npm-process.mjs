import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const npmCli = process.env.npm_execpath ??
  path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

export function npmSpawnSync(arguments_, options = {}) {
  return spawnSync(process.execPath, [npmCli, ...arguments_], {
    encoding: "utf8",
    ...options,
  });
}

export function npmSpawn(arguments_, options = {}) {
  return spawn(process.execPath, [npmCli, ...arguments_], {
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}
