import type { ExecResult } from "./types.js";

export function stdoutText(result: ExecResult): string | undefined {
  return result.stdout;
}

export function stderrText(result: ExecResult): string | undefined {
  return result.stderr;
}
