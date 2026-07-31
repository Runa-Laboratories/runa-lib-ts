# Core

Generated from the released public TypeScript declarations.

<a id="runa"></a>
## Runa

Constructible Runa client that owns managers, transport lifecycle, and cleanup.

**Kind:** runtime

**Signature**

```ts
class Runa
```

### Public members

#### constructor

Constructs the documented public value.

```ts
constructor(config?: RunaConfig): Runa
```

#### sessions

Stable sessions manager owned by this client.

```ts
sessions: SessionsManager
```

#### records

Stable records manager owned by this client.

```ts
records: RecordsManager
```

#### me

Reads the caller profile and workspace state.

```ts
me(): Promise<Me>
```

#### close

Closes this client after already admitted work completes.

```ts
close(): Promise<void>
```

### Runa#constructor

Invokes the accepted public `constructor` operation owned by `Runa`.

**Returns:** A configured Runa client.

- **config:** Optional client configuration resolved under the documented precedence rules.

**Throws**

- `ConfigError` when the contract-backed failure condition applies.

**Example**

```ts
const apiKey = process.env.RUNA_API_KEY;
if (apiKey === undefined) throw new Error("RUNA_API_KEY is required.");
const client = new Runa({ apiKey });
await client.close();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-RUNA_CONSTRUCTOR`

### Runa#me

Invokes the accepted public `me` operation owned by `Runa`.

**Returns:** The caller profile and workspace state.

**Throws**

- `ApiError` when the contract-backed failure condition applies.

**Example**

```ts
await runa.me();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-RUNA_ME`

### Runa#close

Invokes the accepted public `close` operation owned by `Runa`.

**Returns:** A promise that resolves after client-owned cleanup completes.

**Example**

```ts
await runa.close();
```

Source: [docs/reference/examples/workflows.ts](../reference/examples/workflows.ts) - Test: `TC-048-EXAMPLE-RUNA_CLOSE`

<a id="runaconfig"></a>
## RunaConfig

Configuration accepted while constructing a Runa client.

**Kind:** type

**Signature**

```ts
interface RunaConfig
```

### Public members

#### apiKey

Optional constructor API key selected before environment or explicit-file sources.

```ts
apiKey?: string
```

#### baseUrl

Optional normalized HTTPS API origin override.

```ts
baseUrl?: string
```

#### configFile

Optional explicit JSON configuration file, or null to disable file loading.

```ts
configFile?: string | null
```

#### fetch

Optional caller-owned fetch-compatible transport function.

```ts
fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | (input: string | Request | URL, init?: RequestInit) => Promise<Response>
```

#### diagnostics

Optional caller-owned diagnostic sink.

```ts
diagnostics?: DiagnosticSink
```

#### tracing

Optional caller-owned tracing sink.

```ts
tracing?: TraceSink
```

