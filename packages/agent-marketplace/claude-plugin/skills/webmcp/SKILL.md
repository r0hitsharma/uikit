---
name: webmcp
description: WHEN exposing app functionality to AI agents as page tools, or reviewing tool definitions; use @r0hitsharma/webmcp (defineTool, useRegisterTool) and the relay/mcp-connect packages instead of calling document.modelContext or @mcp-b/* directly. NOT for building a standalone MCP server.
---

# WebMCP Tools For UIKit Apps

WebMCP lets a page register tools that an agent calls inside the user's own
authenticated browser session. The standard is young and moving: build against
`@r0hitsharma/webmcp`, the seam that absorbs spec and polyfill churn.

## Setup

- Mount `WebMCPProvider` once, near the app root. It initializes the polyfill
  and the tool registry.
- The provider's MCP-B transport accepts the page's own origin only; the
  iframe transport is off. Widen it only with an explicit `transport` prop
  naming origins (`tabServer` / `iframeServer`), never `['*']`.
- Define tools with `defineTool` and register them with `useRegisterTool` inside
  the component that owns the state the tool reads or changes. The tool lives
  exactly as long as that component is mounted.
- Never call `document.modelContext`, `navigator.modelContext`, or `@mcp-b/*`
  directly from app code.
- `useContributeViewState` feeds the local registry only (`getViewState()`, for
  debug panels and tests). It is not sent to agents: neither the relay nor
  native registration exposes it. State an agent must read needs a read-only
  tool (no `mutation`).

## Designing a tool

- Make tools task-level ("filter the table by owner"), not click-level
  ("click button 3").
- Name: stable, namespaced `area.verb` (e.g. `explorer.selectIdentity`), only
  `[A-Za-z0-9_.-]`, 30 characters or fewer. `defineTool` throws on an invalid
  name. Renaming a tool breaks agents.
- `title`: a short human-readable name ("Select identity") for tool pickers.
- Description: written for a model, 500 characters or fewer (`defineTool`
  warns above that). State preconditions and what the tool changes.
- `schema`: a JSON Schema object. List `required` fields and give each property
  a description of 150 characters or fewer.
- Handler result: small (about 1.5K characters), JSON-serializable data. Return
  it plain, never an MCP `{ content: [...] }` wrapper: the browser serializes it
  and the bridges build the MCP result. Throw on failure; do not return
  error-shaped success values (a throw reaches MCP clients as `isError`).
- Declare `outputSchema` when the result has a stable object shape; MCP
  clients (via MCP-B and the relay) receive it and the result as
  `structuredContent`.
- Handlers get `(args, { signal })`. Pass `signal` to `fetch()` and other
  cancellable work: it aborts when the agent cancels, the tool unmounts
  mid-call, or the relay disconnects.
- Treat every argument as untrusted input. Validate it before acting on it.

## Safety

- Any tool that changes state sets `mutation: true` and a `confirmationSummary`
  (one plain-English sentence built from the args). `defineTool` throws if the
  summary is missing.
- Every call to a mutation waits for the user's approval on every path (native
  agent, MCP-B client, relay): the provider owns one confirmation queue. Mount
  `ConfirmToolCallDialog` wired to `useToolConfirmation()` (or
  `useRelaySession()`, which returns the same queue) at the app root. Without
  a dialog, mutations are denied when the window expires, and a denied call
  returns `{ denied: true }` without running the handler.
- Still validate in the handler: confirmation proves a human agreed to the
  summary, not that the arguments are safe.
- Annotations come from `mutation`: a mutation registers
  `consequentialHint: true`, anything else `readOnlyHint: true`. Override with
  `annotations` only when that is wrong. There is no `destructiveHint` in
  WebMCP.
- Tools that return user-generated or third-party content set
  `annotations: { untrustedContentHint: true }`, so the agent does not follow
  instructions found in the output.

## Connecting an agent

- Claude Code and Copilot reach page tools through the relay:
  `useRelaySession` drives the session, and `@r0hitsharma/mcp-connect`
  (`HarnessConnect`, `ConfirmToolCallDialog`) provides the pairing and
  confirmation UI.
- For local debugging in Chrome, enable `chrome://flags/#enable-webmcp-testing`,
  or use Chrome DevTools MCP with its experimental WebMCP tools
  (`list_webmcp_tools`, `execute_webmcp_tool`).

## Testing

- Render with `<WebMCPProvider initPolyfill={false}>` and assert on the
  registry (`useToolRegistry`, `listTools`) rather than on the browser global.
- Call handlers directly for unit tests. For anything with `mutation: true`,
  also test approve and deny through `useToolConfirmation`.

## Spec status (check before relying on it)

- Spec: https://webmachinelearning.github.io/webmcp/ (W3C Web Machine Learning
  Community Group draft). The entry point is `document.modelContext`.
  `registerTool` returns a Promise; tools are unregistered by aborting the
  signal passed to it. `provideContext`, `clearContext` and `unregisterTool`
  do not exist. Annotations: `readOnlyHint`, `untrustedContentHint`,
  `consequentialHint`. Events: `toolchange`, `toolactivated`, `toolcancel`.
- Browsers: origin trials in Chrome and Edge only. Mozilla is neutral and WebKit
  opposes. Tools must degrade to no-ops where the API is missing.
- Declarative, form-based tools (`toolname` attributes) are not specified yet.
  Do not build on them.
