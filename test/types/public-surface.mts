import { stderrText, stdoutText } from "../../src/index.js";
import type {
  AgentAuthenticationStatus,
  AssignedWorkspace,
  Workspace,
} from "../../src/index.js";

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
type AgentAuthenticationStatusIsClosed = Assert<
  Equal<keyof AgentAuthenticationStatus, "agent" | "method" | "state">
>;

export type {
  AgentAuthenticationStatusIsClosed,
  AssignedDiscriminantIsLiteral,
  StderrHelperContract,
  StdoutHelperContract,
  WorkspaceDiscriminantIsClosed
};
