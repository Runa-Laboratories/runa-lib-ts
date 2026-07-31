import type { ExecResult } from "./types.js";

export function stdoutText(result: ExecResult): string | undefined {
  return typeof result.stdout === "string" ? result.stdout : undefined;
}

export function stderrText(result: ExecResult): string | undefined {
  return typeof result.stderr === "string" ? result.stderr : undefined;
}
