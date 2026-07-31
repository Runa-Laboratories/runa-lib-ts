import type { ExecResult } from "./types.js";

export function stdoutText(result: ExecResult): string {
  return result.stdout;
}

export function stderrText(result: ExecResult): string {
  return result.stderr;
}
