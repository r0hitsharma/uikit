/**
 * Tool-definition contract for @r0hitsharma/webmcp.
 *
 * Mirrors the Python ToolSpec / define_tool idiom in the relay core
 * (schema-first authoring shape).
 *
 * Usage:
 *
 *   import { defineTool } from '@r0hitsharma/webmcp';
 *
 *   const selectIdentity = defineTool({
 *     name: 'explorer.selectIdentity',
 *     description: 'Select and focus an identity node in the Explorer.',
 *     schema: {
 *       type: 'object',
 *       properties: { identityId: { type: 'string' } },
 *       required: ['identityId'],
 *     },
 *     handler: async ({ identityId }) => { ... },
 *   });
 */

import type { ToolInputSchema } from './protocol.js';

// ---------------------------------------------------------------------------
// Tool-definition contract
// ---------------------------------------------------------------------------

/** Per-call context passed to a tool handler. */
export interface ToolHandlerContext {
  /**
   * Aborted when the tool is unregistered mid-call (its component unmounted,
   * or the provider re-initialized) or, on the relay path, when the
   * back-channel closes. An agent's own cancellation reaches it only where the
   * browser's `document.modelContext` passes a per-call signal: the MCP-B
   * polyfill (5.1.0) passes none, and the relay protocol has no cancel frame.
   * Pass it to fetch() and other cancellable work.
   */
  signal: AbortSignal;
}

export type ToolHandler<TArgs = Record<string, unknown>, TResult = unknown> = (
  args: TArgs,
  context?: ToolHandlerContext,
) => Promise<TResult> | TResult;

/**
 * WebMCP tool annotations (hints for the agent, not enforcement).
 *
 * `readOnlyHint` and `consequentialHint` are derived from `mutation` when not
 * set: a mutation is consequential and not read-only, anything else is
 * read-only. Set them explicitly only to override that.
 */
export interface ToolAnnotations {
  /** The tool does not modify state. Default: `!mutation`. */
  readOnlyHint?: boolean;
  /**
   * The result can contain content the page does not control (user-generated
   * text, third-party data), so an agent should not follow instructions in it.
   * @default false
   */
  untrustedContentHint?: boolean;
  /** The tool has effects the user would want to know about. Default: `mutation`. */
  consequentialHint?: boolean;
}

/**
 * The annotations a tool is registered with: explicit values from
 * `spec.annotations`, else derived from `mutation`.
 */
export function resolveAnnotations(
  spec: Pick<ToolSpec, 'mutation' | 'annotations'>,
): Required<ToolAnnotations> {
  const mutation = spec.mutation === true;
  return {
    readOnlyHint: spec.annotations?.readOnlyHint ?? !mutation,
    untrustedContentHint: spec.annotations?.untrustedContentHint ?? false,
    consequentialHint: spec.annotations?.consequentialHint ?? mutation,
  };
}

/** JSON Schema for a tool's result object. */
export type ToolOutputSchema = Record<string, unknown>;

export interface ToolSpec<TArgs = Record<string, unknown>, TResult = unknown> {
  /**
   * Tool name, e.g. "explorer.selectIdentity": 1-128 characters of
   * `[A-Za-z0-9_.-]` (WebMCP); keep it short (Chrome suggests 30 or fewer).
   */
  name: string;
  /** Human-readable display name, e.g. "Select identity". */
  title?: string;
  /** What the tool does, for the agent; aim for 500 characters or fewer. */
  description: string;
  schema: ToolInputSchema;
  /**
   * JSON Schema of the handler's result. Forwarded to MCP clients (via the
   * MCP-B bridge and the relay); a handler that declares one must return a
   * matching object. WebMCP itself has no output schema.
   */
  outputSchema?: ToolOutputSchema;
  annotations?: ToolAnnotations;
  handler: ToolHandler<TArgs, TResult>;
  /** True for any tool that mutates state. Triggers human-in-the-loop confirmation. */
  mutation?: boolean;
  /**
   * Returns a one-sentence plain-English summary shown in the confirmation dialog.
   * Required when mutation is true.
   */
  confirmationSummary?: (args: TArgs) => string;
}

/** WebMCP's tool-name rule: 1-128 ASCII alphanumerics, `_`, `.` or `-`. */
const TOOL_NAME_RE = /^[A-Za-z0-9_.-]{1,128}$/;

/** Chrome's guidance for a tool description, in characters. */
const TOOL_DESCRIPTION_BUDGET = 500;

// Tools are often defined inline in a component body, so warn once per name
// rather than on every render.
const warnedDescriptions = new Set<string>();

/**
 * Define a tool using the schema-first idiom.
 *
 * This is a pass-through factory; the returned value is the same object.
 * It exists to provide type inference on the handler args and to make tool
 * definitions self-documenting at the call site.
 *
 * Throws on a name `document.modelContext.registerTool` would reject, on a
 * mutation without a confirmationSummary, and on a mutation annotated
 * `readOnlyHint: true`. Warns (does not throw) when the
 * description exceeds Chrome's 500-character guidance: that is a budget for
 * the agent's context, not a rule any browser enforces, so it must not break a
 * working tool.
 */
export function defineTool<TArgs = Record<string, unknown>, TResult = unknown>(
  spec: ToolSpec<TArgs, TResult>,
): ToolSpec<TArgs, TResult> {
  if (typeof spec.name !== 'string' || !TOOL_NAME_RE.test(spec.name)) {
    throw new Error(
      `defineTool("${String(spec.name)}"): a tool name must be 1-128 characters of A-Z, a-z, 0-9, "_", "." or "-".`,
    );
  }
  if (
    spec.description.length > TOOL_DESCRIPTION_BUDGET &&
    !warnedDescriptions.has(spec.name)
  ) {
    warnedDescriptions.add(spec.name);
    console.warn(
      `defineTool("${spec.name}"): the description is ${spec.description.length} characters; keep it to ${TOOL_DESCRIPTION_BUDGET} or fewer so it fits an agent's tool budget.`,
    );
  }
  // Enforce the cross-field invariant the type system can't express cleanly:
  // a mutation must carry a confirmationSummary, otherwise the human-in-the-loop
  // dialog would have nothing to show. Fail loudly at authoring time.
  if (spec.mutation && !spec.confirmationSummary) {
    throw new Error(
      `defineTool("${spec.name}"): a tool with mutation:true must provide a confirmationSummary.`,
    );
  }
  // A mutation advertised as read-only would tell MCP clients it is safe to
  // call without asking (the relay then emits readOnlyHint with no
  // destructiveHint), contradicting the confirmation gate.
  if (spec.mutation && spec.annotations?.readOnlyHint === true) {
    throw new Error(
      `defineTool("${spec.name}"): a tool with mutation:true cannot set annotations.readOnlyHint: true.`,
    );
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Registry interface (implemented in Phase 1 by WebMCPProvider)
// ---------------------------------------------------------------------------

export interface ViewState {
  selectedIdentityId?: string;
  selectedContentUuid?: string;
  selectedBranch?: string;
  mode?: string;
  [key: string]: unknown;
}

export interface ToolRegistry {
  registerTool: <TArgs = Record<string, unknown>, TResult = unknown>(
    spec: ToolSpec<TArgs, TResult>,
  ) => () => void;
  listTools: () => ToolSpec[];
  getViewState: () => ViewState;
}

// ---------------------------------------------------------------------------
// Pending-call confirmation prompt (input shape for a browser confirmation UI)
// ---------------------------------------------------------------------------

/**
 * A mutation awaiting approval, as the browser-side UI needs to render it.
 *
 * Named `PendingCallPrompt` (not `PendingCall`) to avoid colliding with
 * `@r0hitsharma/mcp-connect`'s richer `PendingCallRecord`, which carries
 * lifecycle status. This shape is the minimal prompt: what the dialog displays.
 */
export interface PendingCallPrompt {
  callId: string;
  toolName: string;
  summary: string;
  argsPreview: Record<string, unknown>;
  /** ISO-8601 timestamp when the prompt was raised (for the countdown bar). */
  createdAt: string;
  expiresAt: string;
}
