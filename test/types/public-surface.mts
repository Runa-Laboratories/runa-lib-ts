import { stderrText, stdoutText } from "../../src/index.js";
import type { AssignedWorkspace, Workspace } from "../../src/index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Assert<Condition extends true> = Condition;

type AssignedDiscriminantIsLiteral = Assert<
  Equal<AssignedWorkspace["assigned"], true>
>;
type WorkspaceDiscriminantIsClosed = Assert<
  Equal<Workspace["assigned"], true | false>
>;
type StdoutHelperContract = Assert<
  Equal<ReturnType<typeof stdoutText>, string | undefined>
>;
type StderrHelperContract = Assert<
  Equal<ReturnType<typeof stderrText>, string | undefined>
>;

export type {
  AssignedDiscriminantIsLiteral,
  StderrHelperContract,
  StdoutHelperContract,
  WorkspaceDiscriminantIsClosed
};
