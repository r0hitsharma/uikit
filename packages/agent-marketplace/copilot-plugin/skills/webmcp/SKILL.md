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
- Define tools with `defineTool` and register them with `useRegisterTool` inside
  the component that owns the state the tool reads or changes. The tool lives
  exactly as long as that component is mounted.
- Never call `document.modelContext`, `navigator.modelContext`, or `@mcp-b/*`
  directly from app code.
- Contribute read-only context with `useContributeViewState`. Do not add a
  "get state" tool for context the view already has.

## Designing a tool

- Make tools task-level ("filter the table by owner"), not click-level
  ("click button 3").
- Name: stable, namespaced `area.verb` (e.g. `explorer.selectIdentity`), only
  `[A-Za-z0-9_.-]`, 30 characters or fewer. Renaming a tool breaks agents.
- Description: written for a model, 500 characters or fewer. State
  preconditions and what the tool changes.
- `schema`: a JSON Schema object. List `required` fields and give each property
  a description of 150 characters or fewer.
- Handler result: small (about 1.5K characters), JSON-serializable data. Throw
  on failure; do not return error-shaped success values.
- Treat every argument as untrusted input. Validate it before acting on it.

## Safety

- Any tool that changes state sets `mutation: true` and a `confirmationSummary`
  (one plain-English sentence built from the args). `defineTool` throws if the
  summary is missing.
- The confirmation dialog runs on the relay path (`useRelaySession` with
  `ConfirmToolCallDialog`). A native browser agent calling the tool directly may
  skip it, so a handler must never assume a human approved it.
- Tools that return user-generated or third-party content must say so in the
  description; the agent treats that output as untrusted.

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
- Call handlers directly for unit tests. Exercise one end-to-end invoke through
  the relay for anything with `mutation: true`.

## Spec status (check before relying on it)

- Spec: https://webmachinelearning.github.io/webmcp/ (W3C Web Machine Learning
  Community Group draft). The entry point is `document.modelContext`. Tools are
  unregistered by aborting the signal passed to `registerTool`.
  `provideContext` and `clearContext` were removed.
- Browsers: origin trials in Chrome and Edge only. Mozilla is neutral and WebKit
  opposes. Tools must degrade to no-ops where the API is missing.
- Declarative, form-based tools (`toolname` attributes) are not specified yet.
  Do not build on them.
