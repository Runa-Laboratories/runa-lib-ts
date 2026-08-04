# Sessions

Generated from the released public TypeScript declarations.

<a id="session"></a>
## Session

Client-owned session handle with an immutable current snapshot and bounded operations.

**Kind:** runtime

**Signature**

```ts
class Session
```

### Public members

#### id

Canonical lowercase UUID returned for this public value.

```ts
id: string
```

#### snapshot

Current immutable snapshot owned by this session handle.

```ts
snapshot: SessionSnapshot
```

#### refresh

Refreshes this handle from the canonical session item read.

```ts
refresh(): Promise<Session>
```

#### start

Starts the owning session and refreshes only that handle after success.

```ts
start(): Promise<Session>
```

#### pause

Pauses the owning session and refreshes only that handle after success.

```ts
pause(): Promise<Session>
```

#### resume

Resumes the owning session and refreshes only that handle after success.

```ts
resume(): Promise<Session>
```

#### stop

Stops the owning session and refreshes only that handle after success.

```ts
stop(): Promise<Session>
```

#### delete

Deletes the owning session and returns an acknowledgement.

```ts
delete(): Promise<Acknowledgement>
```

#### exec

Runs one buffered command through the owning session handle.

```ts
exec(command: string | readonly string[], options?: ExecOptions): Promise<ExecResult>
```

#### checkpoint

Creates one named checkpoint through the owning session handle.

```ts
checkpoint(name: string): Promise<Acknowledgement>
```

#### open

Acquires and returns a validated session handoff without using it automatically.

```ts
open(): Promise<OpenSessionResult>
```

#### authenticationStatus

Reads the secret-free authentication status of this session's agent.

```ts
authenticationStatus(): Promise<AgentAuthenticationStatus>
```

### Session#refresh

Invokes the accepted public `refresh` operation owned by `Session`.

**Returns:** The same session handle after an atomic successful refresh.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await session.refresh();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSION_REFRESH`

### Session#start

Invokes the accepted public `start` operation owned by `Session`.

**Returns:** The same session handle after a successful start response.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await session.start();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSION_START`

### Session#pause

Invokes the accepted public `pause` operation owned by `Session`.

**Returns:** The same session handle after a successful pause response.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await session.pause();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSION_PAUSE`

### Session#resume

Invokes the accepted public `resume` operation owned by `Session`.

**Returns:** The same session handle after a successful resume response.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await session.resume();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSION_RESUME`

### Session#stop

Invokes the accepted public `stop` operation owned by `Session`.

**Returns:** The same session handle after a successful stop response.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await session.stop();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSION_STOP`

### Session#delete

Invokes the accepted public `delete` operation owned by `Session`.

**Returns:** An acknowledgement whose ok member is literal true.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await session.delete();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSION_DELETE`

### Session#exec

Invokes the accepted public `exec` operation owned by `Session`.

**Returns:** The complete buffered execution result.

- **command:** Non-empty command string or non-empty ordered string argument vector.
- **options:** Optional working directory and integer timeout.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await session.exec(["printf", "%s", "ready"], { timeoutSecs: 30 });
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSION_EXEC`

### Session#checkpoint

Invokes the accepted public `checkpoint` operation owned by `Session`.

**Returns:** An acknowledgement whose ok member is literal true.

- **name:** Checkpoint name containing between one and eighty characters.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await session.checkpoint("before-change");
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSION_CHECKPOINT`

### Session#open

Invokes the accepted public `open` operation owned by `Session`.

**Returns:** A validated handoff result returned without automatic use.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await session.open();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSION_OPEN`

### Session#authenticationStatus

Invokes the accepted public `authenticationStatus` operation owned by `Session`.

**Returns:** The strict agent authentication method and state.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
const authentication = await session.authenticationStatus();
if (authentication.state === "login_required") {
  const handoff = await session.open();
  void handoff; // Pass to the user's browser; never log or persist it.
}
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSION_AUTHENTICATION_STATUS`

<a id="sessionsmanager"></a>
## SessionsManager

Client-owned entry point for creating, listing, and retrieving sessions.

**Kind:** type

**Signature**

```ts
interface SessionsManager
```

### Public members

#### create

Creates one session and returns its client-owned handle.

```ts
create(name: string, options?: SessionCreateOptions): Promise<Session>
```

#### list

Lists the complete public collection for this manager.

```ts
list(): Promise<readonly Session[]>
```

#### get

Retrieves one session by canonical identifier.

```ts
get(id: string): Promise<Session>
```

### SessionsManager#create

Invokes the accepted public `create` operation owned by `SessionsManager`.

**Returns:** A client-owned handle for the created session.

- **name:** Session name containing between one and eighty characters.
- **options:** Optional agent, resource, host, and runtime-port settings.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await runa.sessions.create("worker", { agent: "codex" });
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSIONS_CREATE`

### SessionsManager#list

Invokes the accepted public `list` operation owned by `SessionsManager`.

**Returns:** A fresh readonly ordered collection of client-owned session handles.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await runa.sessions.list();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSIONS_LIST`

### SessionsManager#get

Invokes the accepted public `get` operation owned by `SessionsManager`.

**Returns:** A client-owned handle for the requested session.

- **id:** Exact canonical lowercase session UUID.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await runa.sessions.get(sessionId);
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-SESSIONS_GET`

<a id="sessionagent"></a>
## SessionAgent

Accepted agent identifier for a session.

**Kind:** type

**Signature**

```ts
type SessionAgent = "claude-code" | "codex" | "openclaw"
```

<a id="agentauthenticationmethod"></a>
## AgentAuthenticationMethod

Authentication method selected for a session agent.

**Kind:** type

**Signature**

```ts
type AgentAuthenticationMethod = "none" | "interactive_login" | "api_key"
```

<a id="agentauthenticationstate"></a>
## AgentAuthenticationState

Secret-free authentication state reported for a session agent.

**Kind:** type

**Signature**

```ts
type AgentAuthenticationState = "not_applicable" | "installing" | "login_required" | "authenticated" | "configured" | "unavailable"
```

<a id="agentauthenticationstatus"></a>
## AgentAuthenticationStatus

Secret-free authentication status of a session agent.

**Kind:** type

**Signature**

```ts
interface AgentAuthenticationStatus
```

### Public members

#### agent

Selected session agent, when the API returned or the caller supplied one.

```ts
agent: SessionAgent | null
```

#### method

Authentication method selected for the session agent.

```ts
method: AgentAuthenticationMethod
```

#### state

Strict secret-free authentication state of the session agent.

```ts
state: AgentAuthenticationState
```

<a id="outboundpolicymode"></a>
## OutboundPolicyMode

Accepted outbound network policy mode.

**Kind:** type

**Signature**

```ts
type OutboundPolicyMode = "allowlist" | "denylist"
```

<a id="outboundpolicy"></a>
## OutboundPolicy

Explicit allow-list or deny-list policy for session creation.

**Kind:** type

**Signature**

```ts
interface OutboundPolicy
```

### Public members

#### mode

Selected allow-list or deny-list policy mode.

```ts
mode: OutboundPolicyMode
```

#### hosts

Ordered exact-domain or leading-wildcard rules for the selected mode.

```ts
hosts: readonly string[]
```

<a id="sessioncreateoptions"></a>
## SessionCreateOptions

Optional resources and network policy supplied during session creation.

**Kind:** type

**Signature**

```ts
interface SessionCreateOptions
```

### Public members

#### agent

Selected session agent, when the API returned or the caller supplied one.

```ts
agent?: SessionAgent
```

#### vcpus

Virtual CPU quantity returned by the API or supplied during creation.

```ts
vcpus?: number
```

#### memoryMiB

Memory quantity in mebibytes.

```ts
memoryMiB?: number
```

#### allowedHosts

Optional ordered host allowlist copied into the create request.

```ts
allowedHosts?: readonly string[]
```

#### outboundPolicy

Optional explicit outbound network policy copied into the create request.

```ts
outboundPolicy?: OutboundPolicy
```

#### runtimePort

Optional runtime port included in session creation.

```ts
runtimePort?: number
```

<a id="sessionsnapshot"></a>
## SessionSnapshot

Immutable public observation of a session.

**Kind:** type

**Signature**

```ts
interface SessionSnapshot
```

### Public members

#### id

Canonical lowercase UUID returned for this public value.

```ts
id: string
```

#### userId

Canonical identifier of the user that owns the session.

```ts
userId: string
```

#### slug

Validated runtime slug returned for the session.

```ts
slug: string
```

#### name

Public name returned by the API or supplied for an operation.

```ts
name: string
```

#### agent

Selected session agent, when the API returned or the caller supplied one.

```ts
agent?: SessionAgent
```

#### vcpus

Virtual CPU quantity returned by the API or supplied during creation.

```ts
vcpus: number
```

#### memoryMiB

Memory quantity in mebibytes.

```ts
memoryMiB: number
```

#### status

Documented session status or HTTP status, according to the owning declaration.

```ts
status: SessionStatus
```

#### runningSeconds

Non-negative running duration returned by the API.

```ts
runningSeconds: number
```

#### createdAt

RFC 3339 creation timestamp returned by the API.

```ts
createdAt: string
```

#### updatedAt

RFC 3339 last-update timestamp returned by the API.

```ts
updatedAt: string
```

#### url

Validated runtime or handoff URL returned to the caller.

```ts
url: string
```

<a id="sessionstatus"></a>
## SessionStatus

Documented session status returned by the API.

**Kind:** type

**Signature**

```ts
type SessionStatus = "creating" | "running" | "paused" | "suspended" | "stopped" | "deleted" | "error"
```

<a id="execoptions"></a>
## ExecOptions

Optional working directory and timeout for buffered execution.

**Kind:** type

**Signature**

```ts
interface ExecOptions
```

### Public members

#### cwd

Optional working directory passed to buffered execution.

```ts
cwd?: string
```

#### timeoutSecs

Optional integer execution timeout in seconds.

```ts
timeoutSecs?: number
```

<a id="execresult"></a>
## ExecResult

Complete buffered command result returned after execution.

**Kind:** type

**Signature**

```ts
interface ExecResult
```

### Public members

#### exitCode

Integer process exit code returned after execution.

```ts
exitCode: number
```

#### stdout

Complete buffered standard-output text returned by execution.

```ts
stdout: string
```

#### stderr

Complete buffered standard-error text returned by execution.

```ts
stderr: string
```

#### durationMs

Non-negative command duration in milliseconds.

```ts
durationMs: number
```

#### stdoutTruncated

Whether the returned standard-output text was truncated.

```ts
stdoutTruncated: boolean
```

#### stderrTruncated

Whether the returned standard-error text was truncated.

```ts
stderrTruncated: boolean
```

<a id="acknowledgement"></a>
## Acknowledgement

Successful acknowledgement with literal true status.

**Kind:** type

**Signature**

```ts
interface Acknowledgement
```

### Public members

#### ok

Literal true acknowledgement of successful completion.

```ts
ok: true
```

<a id="opensessionresult"></a>
## OpenSessionResult

Single-use session handoff result returned to the caller without automatic use.

**Kind:** type

**Signature**

```ts
interface OpenSessionResult
```

### Public members

#### url

Validated runtime or handoff URL returned to the caller.

```ts
url: string
```

