/**
 * RelaySession: sans-I/O state machine for ONE relay session.
 *
 * CORE vs HOST BOUNDARY
 * ---------------------
 * This class owns protocol framing and state tracking ONLY.
 * It never touches a socket, timer, or Promise.
 *
 * The HOST (e.g. the Cloudflare Durable Object in session-do.ts) is
 * responsible for:
 *   - Holding the live WebSocket and sending/receiving frames.
 *   - The async invoke round-trip: generating a call_id, sending the
 *     InvokeMessage over the WS, storing a {resolve, reject, timer} entry
 *     keyed by call_id, resolving it when the browser's `result` frame
 *     arrives, and timing out after INVOKE_TIMEOUT_MS.
 *   - Scheduling the liveness TTL sweep (e.g. via a DO alarm).
 *
 * The core's role in a tools/call flow:
 *   1. Host calls core.buildInvoke(callId, name, args) to get the wire frame.
 *   2. Host sends the frame and registers the pending call.
 *   3. Browser sends a `result` frame; host calls core.buildToolActivity(...)
 *      to get the terminal activity frame, then resolves the pending call.
 *   4. Host pushes the tool_activity frames and returns the JSON-RPC response.
 */

import type {
  HelloAcceptedMessage,
  HelloMessage,
  HelloRejectedMessage,
  HarnessStatusMessage,
  InvokeMessage,
  ToolActivityMessage,
  ToolDefinition,
} from './protocol.js';

/** An entry of an MCP `tools/list` result. */
export interface McpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: ToolDefinition['input_schema'];
  outputSchema?: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  };
}

/**
 * Map a browser tool definition to an MCP `tools/list` entry.
 *
 * MCP has readOnlyHint and destructiveHint; WebMCP has readOnlyHint and
 * consequentialHint. A tool is destructive to MCP when the browser marked it
 * consequential or as a mutation. Definitions from browsers that predate
 * annotations carry only `mutation`, which maps to readOnlyHint: false +
 * destructiveHint: true. With nothing to go on, no annotations are emitted
 * (MCP's defaults then apply). WebMCP's untrustedContentHint has no MCP
 * counterpart and is not forwarded.
 */
export function toMcpTool(def: ToolDefinition): McpTool {
  const hints = def.annotations ?? {};
  const destructive = hints.consequentialHint ?? def.mutation;
  const readOnly = hints.readOnlyHint ?? (def.mutation ? false : undefined);
  const annotations: NonNullable<McpTool['annotations']> = {
    ...(readOnly !== undefined ? { readOnlyHint: readOnly } : {}),
    // Only meaningful for a tool that is not read-only.
    ...(destructive !== undefined && readOnly !== true
      ? { destructiveHint: destructive }
      : {}),
  };
  return {
    name: def.name,
    ...(def.title !== undefined ? { title: def.title } : {}),
    description: def.description,
    inputSchema: def.input_schema,
    ...(def.output_schema !== undefined
      ? { outputSchema: def.output_schema }
      : {}),
    ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
  };
}

/** An MCP `tools/call` result. */
export interface McpCallToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A payload that is already an MCP CallToolResult: a non-empty `content`
 * array of typed blocks. Plain tool data that happens to have a `content`
 * field (`{ content: ['para 1'] }`) does not qualify.
 */
function isCallToolResult(value: unknown): value is McpCallToolResult {
  if (!isPlainObject(value)) return false;
  const content = value['content'];
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content.every(
      (block) => isPlainObject(block) && typeof block['type'] === 'string',
    )
  );
}

/**
 * Map a browser `result` frame's payload to an MCP `tools/call` result.
 *
 * - `error` is a string (even empty): the tool failed; `isError: true` with
 *   the message.
 * - an object: JSON text for older clients, plus the object as
 *   `structuredContent` (MCP only allows an object there).
 * - anything else: text (a string as-is, other values as JSON).
 *
 * A payload that already is a CallToolResult (a `content` array of typed
 * blocks) passes through unchanged, for older browsers that built their own.
 */
export function toCallToolResult(
  result: unknown,
  error?: string | null,
): McpCallToolResult {
  // Any error string marks a failure, even an empty one (a browser that sent
  // `throw new Error()` through): only null/undefined means success.
  if (typeof error === 'string') {
    return {
      content: [{ type: 'text', text: error || 'The tool call failed.' }],
      isError: true,
    };
  }
  if (isCallToolResult(result)) return result;
  const text =
    typeof result === 'string' ? result : (JSON.stringify(result) ?? 'null');
  return {
    content: [{ type: 'text', text }],
    ...(isPlainObject(result) ? { structuredContent: result } : {}),
  };
}

/** State machine states, mirroring the Python SessionRecord. */
export type SessionState = 'pending' | 'connected' | 'disconnected';

/** Narrow an untrusted value to a known SessionState. */
function isSessionState(value: unknown): value is SessionState {
  return (
    value === 'pending' || value === 'connected' || value === 'disconnected'
  );
}

/** Liveness TTL: 90 s matches the Python HARNESS_LIVENESS_TTL_SECONDS. */
export const HARNESS_LIVENESS_TTL_MS = 90_000;

/** Invoke timeout: 30 s matches the Python INVOKE_TIMEOUT_SECONDS. */
export const INVOKE_TIMEOUT_MS = 30_000;

/**
 * Serializable snapshot of a session's durable state. A host (e.g. a Cloudflare
 * Durable Object) persists this so the session survives eviction/hibernation,
 * then rehydrates with RelaySession.fromSnapshot.
 */
export interface RelaySessionSnapshot {
  sessionId: string;
  sessionState: SessionState;
  tools: ToolDefinition[];
  attached: boolean;
  lastSeen: number | null;
}

export class RelaySession {
  readonly sessionId: string;

  private sessionState: SessionState = 'pending';
  private toolsCatalogue: ToolDefinition[] = [];
  private attached = false;
  /** Wall-clock ms of the last harness /mcp call (null = never). */
  private lastSeen: number | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  get state(): SessionState {
    return this.sessionState;
  }
  get tools(): readonly ToolDefinition[] {
    return this.toolsCatalogue;
  }
  get harnessAttached(): boolean {
    return this.attached;
  }
  get lastSeenMs(): number | null {
    return this.lastSeen;
  }

  /** Snapshot the durable state so a host can persist it (e.g. to DO storage). */
  toSnapshot(): RelaySessionSnapshot {
    return {
      sessionId: this.sessionId,
      sessionState: this.sessionState,
      tools: this.toolsCatalogue,
      attached: this.attached,
      lastSeen: this.lastSeen,
    };
  }

  /**
   * Reconstruct a session from a persisted snapshot (after eviction/wake).
   *
   * This is the durability seam: the snapshot may have been written by an older
   * code version, so every field is validated and defaulted rather than trusted.
   * An unknown/corrupt state falls back to `pending`, and `attached`/`lastSeen`
   * are coerced so the wire frames built afterwards never carry undefined values.
   */
  static fromSnapshot(snap: RelaySessionSnapshot): RelaySession {
    const session = new RelaySession(snap.sessionId);
    session.sessionState = isSessionState(snap.sessionState)
      ? snap.sessionState
      : 'pending';
    session.toolsCatalogue = Array.isArray(snap.tools) ? snap.tools : [];
    session.attached = snap.attached === true;
    session.lastSeen = typeof snap.lastSeen === 'number' ? snap.lastSeen : null;
    return session;
  }

  // ---------------------------------------------------------------------------
  // WebSocket lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Validate a browser `hello` and return the appropriate response.
   * The caller (host) is responsible for verifying the connection_token JWT
   * before calling this; pass `tokenValid = false` to reject immediately.
   */
  onHello(
    _hello: HelloMessage,
    tokenValid: boolean,
  ): HelloAcceptedMessage | HelloRejectedMessage {
    if (!tokenValid) {
      return {
        type: 'hello/rejected',
        reason:
          'Session token missing, invalid, or expired. Reconnect from the Explorer panel.',
      };
    }
    this.sessionState = 'connected';
    return { type: 'hello/accepted', session_id: this.sessionId };
  }

  /** Mark the session disconnected (browser WS closed). */
  onDisconnect(): void {
    this.sessionState = 'disconnected';
  }

  // ---------------------------------------------------------------------------
  // Tool catalogue
  // ---------------------------------------------------------------------------

  /** Store the full catalogue pushed by `tools/list` or `tools/changed`. */
  setTools(tools: ToolDefinition[]): void {
    this.toolsCatalogue = tools;
  }

  // ---------------------------------------------------------------------------
  // Harness liveness (mirrors Python relay.py mark_harness_attached / sweep)
  // ---------------------------------------------------------------------------

  /**
   * Called by the host on every /mcp request to record the harness timestamp.
   * Returns a `harness_status` frame to push over the WS.
   */
  touch(nowMs: number): HarnessStatusMessage {
    this.lastSeen = nowMs;
    return this.harnessStatusFrame();
  }

  /**
   * Mark harness attached on `initialize`. Returns the `harness_status` frame
   * to push over the WS (best-effort, host sends it).
   */
  onInitialize(nowMs: number): { harnessStatus: HarnessStatusMessage } {
    this.lastSeen = nowMs;
    this.attached = true;
    return { harnessStatus: this.harnessStatusFrame() };
  }

  /**
   * TTL sweep: revert harness-attached to false if the TTL has elapsed.
   * Returns a `harness_status` frame if the state flipped (host must push it),
   * or null if nothing changed.
   */
  sweep(
    nowMs: number,
    ttlMs: number = HARNESS_LIVENESS_TTL_MS,
  ): HarnessStatusMessage | null {
    if (!this.attached) return null;
    if (this.lastSeen === null) {
      // Attached but never seen; treat as expired.
      this.attached = false;
      return this.harnessStatusFrame();
    }
    if (nowMs - this.lastSeen > ttlMs) {
      this.attached = false;
      return this.harnessStatusFrame();
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // JSON-RPC helpers (pure framing; no I/O)
  // ---------------------------------------------------------------------------

  /** Build the JSON-RPC `tools/list` result payload. */
  listToolsResult(jsonRpcId: unknown): object {
    return {
      jsonrpc: '2.0',
      id: jsonRpcId,
      result: {
        tools: this.toolsCatalogue.map(toMcpTool),
      },
    };
  }

  /** Build the JSON-RPC `tools/call` response for a browser `result` frame. */
  callToolResult(
    jsonRpcId: unknown,
    result: unknown,
    error?: string | null,
  ): object {
    return {
      jsonrpc: '2.0',
      id: jsonRpcId,
      result: toCallToolResult(result, error),
    };
  }

  /**
   * Build an `invoke` wire frame for a browser tool call.
   * The HOST generates callId (crypto.randomUUID()) and stores the pending
   * promise before sending this frame.
   */
  buildInvoke(
    callId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): InvokeMessage {
    return { type: 'invoke', call_id: callId, tool_name: toolName, args };
  }

  /**
   * Build a `tool_activity` frame.
   * Called by the host at start (status="started") and on completion (status="ok"|"error").
   */
  buildToolActivity(
    activityId: string,
    toolName: string,
    status: ToolActivityMessage['status'],
    options?: {
      kind?: ToolActivityMessage['kind'];
      args?: Record<string, unknown>;
      resultPreview?: string;
      error?: string;
    },
  ): ToolActivityMessage {
    return {
      type: 'tool_activity',
      activity_id: activityId,
      tool_name: toolName,
      kind: options?.kind ?? 'ui',
      status,
      args: options?.args ?? {},
      result_preview: options?.resultPreview ?? null,
      error: options?.error ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private harnessStatusFrame(): HarnessStatusMessage {
    return {
      type: 'harness_status',
      attached: this.attached,
      last_activity_ms: this.lastSeen,
    };
  }
}
