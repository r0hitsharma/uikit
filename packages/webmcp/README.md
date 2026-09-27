# @r0hitsharma/webmcp

A stable React wrapper for registering UI tools that an AI agent can call, over [WebMCP](https://webmachinelearning.github.io/webmcp/) and the [MCP-B](https://docs.mcp-b.ai) polyfill (`@mcp-b/global`). It exposes a fixed interface so the fast-moving `@mcp-b/*` packages can churn behind a single seam.

Tools are registered into `document.modelContext`. A tool registered here runs in the consumer's own authenticated browser session, so it reuses the app's existing auth and APIs rather than requiring separate server credentials.

## Spec and browser status

- **WebMCP** is a draft of the W3C Web Machine Learning Community Group ([spec](https://webmachinelearning.github.io/webmcp/), [repository](https://github.com/webmachinelearning/webmcp)). It defines `document.modelContext.registerTool()`, tool annotations, and an `execute(input, { signal })` callback whose result the browser serializes as JSON. It is not a standard yet and still changes.
- **Chrome** exposes a native `document.modelContext` through an origin trial (Chrome 149 to 156 at the time of writing). Other browsers do not implement it.
- **MCP-B** ([docs](https://docs.mcp-b.ai), [source](https://github.com/WebMCP-org/npm-packages)) polyfills `document.modelContext` where it is missing and bridges the registered tools to MCP clients such as the MCP-B browser extension. `WebMCPProvider` installs it.
- A harness that cannot reach the page directly can call the same tools through the relay back-channel (`useRelaySession`, [`@r0hitsharma/mcp-relay`](../mcp-relay/README.md)).

## Installation

```bash
npm install @r0hitsharma/webmcp react
```

`react` is a peer dependency (>= 19).

## Features

- Schema-first tool definitions (`defineTool`), validated against WebMCP's naming rules
- WebMCP annotations derived from `mutation`, with per-field overrides
- Human confirmation for every `mutation: true` call, on every invocation path
- An abort `signal` for every handler call, fired when the tool unregisters mid-call or the relay disconnects
- StrictMode-safe registration that mounts/unmounts cleanly
- A React provider that initializes the polyfill with an explicit, same-origin transport
- Hooks to register tools, observe the registry, and contribute view state
- Wire-protocol types shared with the relay back-channel

## Usage

### Wrap your app

```tsx
import { WebMCPProvider } from '@r0hitsharma/webmcp';

export function App() {
  return (
    <WebMCPProvider>
      <YourApp />
    </WebMCPProvider>
  );
}
```

### Define and register a tool

The handler lives on the spec. Build the spec inside the component (or with a
ref) when it needs to close over component state — `useRegisterTool` reads the
latest spec through a ref, so it re-registers only when the tool *name* changes,
never on every render.

```tsx
import { defineTool, useRegisterTool } from '@r0hitsharma/webmcp';

function IdentityView({ onSelect }: { onSelect: (id: string) => void }) {
  const selectIdentityTool = defineTool<{ identityId: string }, { selected: string }>({
    name: 'explorer.selectIdentity',
    description: 'Select and focus an identity node in the Explorer.',
    schema: {
      type: 'object',
      properties: { identityId: { type: 'string' } },
      required: ['identityId'],
    },
    handler: async ({ identityId }) => {
      onSelect(identityId);
      return { selected: identityId };
    },
  });

  useRegisterTool(selectIdentityTool);
  return null;
}
```

### Tool fields

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | 1-128 characters of `A-Z a-z 0-9 _ . -`; `defineTool` throws otherwise. Chrome suggests 30 or fewer. |
| `description` | yes | What the tool does, for the agent. `defineTool` warns (once per tool) above 500 characters, Chrome's guidance; keep parameter descriptions under about 150 and results around 1.5K characters. |
| `schema` | yes | JSON Schema of the input object. |
| `handler` | yes | `(args, { signal }) => result`. Return plain data and throw on failure (see below). |
| `title` | no | Human-readable display name. |
| `annotations` | no | `readOnlyHint`, `consequentialHint`, `untrustedContentHint`. See below. |
| `outputSchema` | no | JSON Schema of the result object. Forwarded to MCP clients (MCP-B, relay); WebMCP has no output schema. |
| `mutation` | no | `true` for a tool that changes state: requires confirmation. |
| `confirmationSummary` | with `mutation` | `(args) => string` shown in the confirmation dialog. |

### Results, errors and cancellation

Return the result as plain data. On `document.modelContext` the browser serializes it as JSON for the agent; the MCP-B bridge and the relay turn it into an MCP result, with an object passed as `structuredContent`. Throw to report a failure: it reaches native agents as a failed call and MCP clients as `isError: true`.

The second handler argument carries an `AbortSignal`. It aborts when the tool is unregistered mid-call (its component unmounts, or the provider re-initializes) and, on the relay path, when the back-channel closes. An agent's own cancellation reaches it only on a browser whose `document.modelContext` passes a per-call signal: the MCP-B polyfill does not (as of 5.1.0), and the relay protocol has no cancel frame. Pass it to `fetch()` and other cancellable work. Handlers that take one argument keep working.

```ts
defineTool({
  name: 'orders.search',
  description: 'Search orders by customer name.',
  schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  annotations: { untrustedContentHint: true }, // results contain customer-entered text
  handler: async ({ q }: { q: string }, context) => {
    const res = await fetch(`/api/orders?q=${encodeURIComponent(q)}`, {
      signal: context?.signal,
    });
    if (!res.ok) throw new Error(`Search failed (HTTP ${res.status}).`);
    return { orders: await res.json() };
  },
});
```

### Annotations

Tools are registered with WebMCP's hints. `readOnlyHint` and `consequentialHint` come from `mutation` unless set explicitly: a mutation is `consequentialHint: true, readOnlyHint: false`; anything else is `readOnlyHint: true`. `untrustedContentHint` (default `false`) tells the agent the result may contain content the page does not control, so it should not follow instructions in it. WebMCP has no `destructiveHint`; MCP clients see a non-read-only tool as destructive (the relay sets `destructiveHint` from `consequentialHint`).

### Confirming mutations

Every call to a `mutation: true` tool waits for the user's approval, whether it came from a native agent, an MCP-B client, or the relay. The provider owns one queue for all of them. Render a dialog from `useToolConfirmation()` (or from `useRelaySession()`, which returns the same queue):

```tsx
import { ConfirmToolCallDialog } from '@r0hitsharma/mcp-connect';
import { useToolConfirmation } from '@r0hitsharma/webmcp';

function Confirmations() {
  const { pendingConfirmation: p, pendingQueueLength, approve, deny } = useToolConfirmation();
  return (
    <ConfirmToolCallDialog
      pendingCall={p && { callId: p.callId, sessionId: '', toolName: p.toolName, toolArgs: p.argsPreview,
        summary: p.summary, createdAt: p.createdAt, expiresAt: p.expiresAt, status: 'pending' }}
      queueLength={pendingQueueLength}
      onApprove={approve}
      onDeny={deny}
    />
  );
}
```

A denied call, or one nobody answers before the window closes (`confirmationWindowSeconds` on the provider, default 50 s, under the MCP SDK's 60 s request timeout; `useRelaySession` uses its own, default 25 s, under the relay's 30 s timeout), fails without running the handler: the agent gets an error (MCP `isError: true`) saying the user declined or did not answer. It is an error rather than a result so it never has to match the tool's `outputSchema`. With no dialog mounted, a mutation call therefore waits out the whole window and is then denied.

### Transport

`@mcp-b/global` starts itself on import and, unconfigured, accepts MCP connections from any origin. This package opts out of that and has `WebMCPProvider` initialize it with an explicit transport: by default the tab transport (used by the MCP-B extension) accepts the page's own origin only, and the iframe transport is off. Configure both with the `transport` prop:

```tsx
<WebMCPProvider
  transport={{
    tabServer: { allowedOrigins: [window.location.origin] },
    // When the page is embedded, name the embedding origins:
    iframeServer: { allowedOrigins: ['https://host.example'] },
  }}
>
```

`false` disables a transport. The prop governs the MCP-B bridge only, not a browser's native `document.modelContext`. A host page can still set `window.__webModelContextOptions` before loading this package: the provider applies its `installTestingShim`, and its `transport` when the prop is not set. Only an explicit `autoInitialize: true` keeps @mcp-b/global's import-time start; the host then owns that instance, and the provider neither re-configures nor tears it down (its `transport` prop has no effect).

## Public surface

- `defineTool` — schema-first tool factory
- `WebMCPProvider` — provider that initializes the polyfill (props: `transport`, `confirmationWindowSeconds`, `initPolyfill`) and the registry
- `useRegisterTool` — register a tool while a component is mounted
- `useTool` — observe a single tool's spec by name
- `useToolRegistry` / `useToolRegistryRef` — read the full registry
- `useContributeViewState` — contribute a partial view-state slice
- `useToolConfirmation` — drive a mutation-confirmation dialog from the provider's queue
- `listTools` / `getViewState` — imperative helpers for non-React callers
- `useRelaySession` — drive the relay back-channel from the registry: mint/reuse a session, advertise the registered tools, run incoming `invoke`s, and gate any `mutation: true` tool behind the shared confirmation queue
- Tool types (`ToolSpec`, `ToolHandler`, `ToolHandlerContext`, `ToolAnnotations`, `ToolOutputSchema`, `PendingCallPrompt`, `ViewState`, `WebMCPTransportOptions`, ...) and the wire-protocol types re-exported from [`@r0hitsharma/mcp-relay`](../mcp-relay/README.md), their single source of truth

## Related

- [`@r0hitsharma/mcp-connect`](../mcp-connect/README.md) — the connection UI (chat icon, status indicator, connect modal) that pairs the browser with a harness over the relay.
