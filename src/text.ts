import type { ExecResult } from "./types.js";

/**
 * Returns stdout only when the supplied wire value is a string.
 * @param result Unknown wire value to inspect without coercion.
 * @returns The stdout string when present with the correct type, otherwise undefined.
 * @runa-contract stdouttext-summary PRD-022#R-022-02
 * @runa-contract stdouttext-stdouttext-description PRD-022#R-022-02
 * @runa-contract stdouttext-stdouttext-param-result PRD-022#R-022-02
 * @runa-contract stdouttext-stdouttext-returns PRD-022#R-022-02
 */
export function stdoutText(result: ExecResult): string | undefined {
  return result.stdout;
}

/**
 * Returns stderr only when the supplied wire value is a string.
 * @param result Unknown wire value to inspect without coercion.
 * @returns The stderr string when present with the correct type, otherwise undefined.
 * @runa-contract stderrtext-summary PRD-022#R-022-02
 * @runa-contract stderrtext-stderrtext-description PRD-022#R-022-02
 * @runa-contract stderrtext-stderrtext-param-result PRD-022#R-022-02
 * @runa-contract stderrtext-stderrtext-returns PRD-022#R-022-02
 */
export function stderrText(result: ExecResult): string | undefined {
  return result.stderr;
}
