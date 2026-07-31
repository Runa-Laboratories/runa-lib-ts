# Account and records

Generated from the released public TypeScript declarations.

<a id="me"></a>
## Me

Caller profile and workspace assignment.

**Kind:** type

**Signature**

```ts
interface Me
```

### Public members

#### id

Canonical lowercase UUID returned for this public value.

```ts
id: string
```

#### email

Email address returned for the caller profile.

```ts
email: string
```

#### workspace

Assigned or unassigned workspace state for the caller.

```ts
workspace: Workspace
```

<a id="workspace"></a>
## Workspace

Assigned or unassigned workspace state.

**Kind:** type

**Signature**

```ts
type Workspace = AssignedWorkspace | UnassignedWorkspace
```

<a id="assignedworkspace"></a>
## AssignedWorkspace

Assigned workspace state with estimated usage.

**Kind:** type

**Signature**

```ts
interface AssignedWorkspace
```

### Public members

#### assigned

Literal discriminator for the workspace assignment variant.

```ts
assigned: true
```

#### usage

Estimated usage available only for an assigned workspace.

```ts
usage: EstimatedUsage
```

#### waitlistPosition

Non-negative waitlist position for an unassigned workspace.

```ts
waitlistPosition?: undefined
```

<a id="unassignedworkspace"></a>
## UnassignedWorkspace

Unassigned workspace state with a waitlist position.

**Kind:** type

**Signature**

```ts
interface UnassignedWorkspace
```

### Public members

#### assigned

Literal discriminator for the workspace assignment variant.

```ts
assigned: false
```

#### waitlistPosition

Non-negative waitlist position for an unassigned workspace.

```ts
waitlistPosition: number
```

#### usage

Estimated usage available only for an assigned workspace.

```ts
usage?: undefined
```

<a id="estimatedusage"></a>
## EstimatedUsage

Estimated spend, remaining amount, and explanatory note.

**Kind:** type

**Signature**

```ts
interface EstimatedUsage
```

### Public members

#### estimatedSpendUsd

Estimated spend amount in US dollars.

```ts
estimatedSpendUsd: number
```

#### estimatedRemainingUsd

Estimated remaining amount in US dollars.

```ts
estimatedRemainingUsd: number
```

#### note

Explanatory estimated-usage note returned by the API.

```ts
note: string
```

<a id="recordsmanager"></a>
## RecordsManager

Client-owned entry point for listing records.

**Kind:** type

**Signature**

```ts
interface RecordsManager
```

### Public members

#### list

Lists the complete public collection for this manager.

```ts
list(): Promise<readonly Record[]>
```

### RecordsManager#list

Invokes the accepted public `list` operation owned by `RecordsManager`.

**Returns:** A fresh readonly ordered collection of records.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await runa.records.list();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-RECORDS_LIST`

<a id="record"></a>
## Record

Immutable record associated with a session.

**Kind:** type

**Signature**

```ts
interface Record
```

### Public members

#### id

Canonical lowercase UUID returned for this public value.

```ts
id: string
```

#### sessionId

Canonical identifier of the session associated with a record.

```ts
sessionId: string
```

#### kind

Record kind returned by the API.

```ts
kind: string
```

#### summary

Safe record summary returned by the API.

```ts
summary: string
```

#### detail

Opaque record detail preserved without an SDK-defined shape.

```ts
detail: unknown
```

#### createdAt

RFC 3339 creation timestamp returned by the API.

```ts
createdAt: string
```

