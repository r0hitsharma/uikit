/* eslint-disable no-underscore-dangle -- the registry exposes internal-by-convention members (_requestConfirmation) that this hook wraps. */
/**
 * useRelaySession
 *
 * Drives a relay back-channel from the browser using the tools registered via
 * `useRegisterTool`. This is the piece that lets a connected harness actually
 * call the page's tools:
 *
 *   - mints (or reuses) a session against the relay Worker and keeps the
 *     WebSocket open, reconnecting with exponential backoff;
 *   - advertises the registered tools (`tools/list`) and re-advertises when the
 *     registry changes;
 *   - on `invoke`, runs the registered tool's handler and returns a `result`;
 *   - gates any tool declared `mutation: true` behind the provider's shared
 *     confirmation queue (the same one document.modelContext calls use): the
 *     invoke is held until the user approves (handler runs, result returned),
 *     denies, or lets it expire (a denial error is returned). The relay stays
 *     a dumb pipe — no confirmation frames cross the wire.
 *
 * Must be called inside <WebMCPProvider>.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { denialMessage } from './confirmation.js';
import { useToolConfirmation } from './hooks.js';
import type { ToolDefinition } from './protocol.js';
import { useToolRegistryContext } from './provider.js';
import {
  resolveAnnotations,
  type PendingCallPrompt,
  type ToolSpec,
} from './types.js';

/** Connection state surfaced to the connect UI (mirrors the indicator states). */
export type RelaySessionStatus =
  | 'disconnected'
  | 'ready'
  | 'connected'
  | 'reconnecting';

export interface UseRelaySessionOptions {
  /** Base URL of the relay Worker, e.g. https://mcp-relay.example.workers.dev */
  relayBaseUrl: string;
  /** localStorage key for persisting the session across reloads. */
  storageKey: string;
  /** Human-readable title sent in the `hello` frame. */
  title?: string;
  /** Seconds a relay mutation confirmation stays open before it expires (and
   *  the call fails with a denial error). Kept under the relay's invoke timeout so a late
   *  approval is not wasted. Calls through document.modelContext use the
   *  provider's `confirmationWindowSeconds` instead. */
  confirmationWindowSeconds?: number;
}

export interface UseRelaySessionResult {
  status: RelaySessionStatus;
  /** Durable token the user pastes into their harness config; null until minted. */
  connectionToken: string | null;
  /** Most-recent-first activity log lines, capped. */
  activity: string[];
  /**
   * The mutation awaiting approval (head of the provider's queue), or null.
   * The queue is shared with document.modelContext calls, so this includes
   * mutations a native or MCP-B agent requested; same as useToolConfirmation.
   */
  pendingConfirmation: PendingCallPrompt | null;
  /** Number of mutations waiting (including the active one). */
  pendingQueueLength: number;
  /** Approve the active mutation: run its handler and return the result. */
  approve: () => void;
  /** Deny the active mutation: the caller gets a denial error. */
  deny: () => void;
}

type StoredSession = {
  connection_token: string;
  ws_url: string;
  expires: number;
};

function toWireTool(spec: ToolSpec): ToolDefinition {
  return {
    name: spec.name,
    ...(spec.title !== undefined ? { title: spec.title } : {}),
    description: spec.description,
    input_schema: spec.schema,
    ...(spec.outputSchema !== undefined
      ? { output_schema: spec.outputSchema }
      : {}),
    // The same hints document.modelContext gets; the relay maps them to MCP.
    annotations: resolveAnnotations(spec),
    ...(spec.mutation ? { mutation: true } : {}),
  };
}

export function useRelaySession({
  relayBaseUrl,
  storageKey,
  title = 'webmcp relay session',
  confirmationWindowSeconds = 25,
}: UseRelaySessionOptions): UseRelaySessionResult {
  const registry = useToolRegistryContext();

  const [status, setStatus] = useState<RelaySessionStatus>('disconnected');
  const [connectionToken, setConnectionToken] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  // The provider's queue: shows every mutation awaiting approval, whichever
  // path it arrived on, so one dialog wired to this hook covers them all.
  const { pendingConfirmation, pendingQueueLength, approve, deny } =
    useToolConfirmation();

  const wsRef = useRef<WebSocket | null>(null);
  const acceptedRef = useRef(false);
  // One controller per running handler or open confirmation, aborted when the
  // back-channel closes (the relay can no longer take the result, and the
  // call_id dies with the socket) or the hook unmounts.
  const runningRef = useRef<Set<AbortController>>(new Set());
  // Always read the freshest registry accessor from the WS handler. Synced
  // in an effect, not during render: refs are read-only during render.
  const listToolsRef = useRef(registry.listTools);
  const requestConfirmationRef = useRef(registry._requestConfirmation);
  useEffect(() => {
    listToolsRef.current = registry.listTools;
    requestConfirmationRef.current = registry._requestConfirmation;
  });

  const log = useCallback((line: string) => {
    setActivity((prev) =>
      [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 50),
    );
  }, []);

  const send = useCallback((frame: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
    }
  }, []);

  const advertiseTools = useCallback(() => {
    send({
      type: 'tools/list',
      tools: listToolsRef.current().map(toWireTool),
    });
  }, [send]);

  // Run a (non-mutation, or already-approved) tool and return its result frame.
  const runAndRespond = useCallback(
    async (callId: string, spec: ToolSpec, args: Record<string, unknown>) => {
      const controller = new AbortController();
      runningRef.current.add(controller);
      try {
        const result = await spec.handler(args as never, {
          signal: controller.signal,
        });
        send({ type: 'result', call_id: callId, result });
        log(`-> ${JSON.stringify(result)?.slice(0, 160)}`);
      } catch (err) {
        // A failed call goes in the protocol's `error` field (the relay maps
        // it to an MCP `isError` result), not dressed up as a success.
        const message = err instanceof Error ? err.message : String(err);
        send({ type: 'result', call_id: callId, result: null, error: message });
        log(`-> error: ${message.slice(0, 160)}`);
      } finally {
        runningRef.current.delete(controller);
      }
    },
    [send, log],
  );

  // Connect + keep the back-channel open, reconnecting with backoff.
  useEffect(() => {
    let closed = false;
    const running = runningRef.current;
    const abortRunning = () => {
      for (const controller of running) controller.abort();
      running.clear();
    };
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function loadStored(): StoredSession | null {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        const s = JSON.parse(raw) as StoredSession;
        if (!s.connection_token || !s.ws_url) return null;
        if (s.expires && Date.now() > s.expires) return null;
        return s;
      } catch {
        return null;
      }
    }

    async function mintSession(): Promise<StoredSession | null> {
      const res = await fetch(`${relayBaseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      // A 4xx/5xx body is the Worker's { error } shape, not a session: surface
      // it instead of connecting to ws_url=undefined.
      if (!res.ok) {
        log(`Session mint failed (HTTP ${res.status}); will retry.`);
        return null;
      }
      const minted = (await res.json()) as Partial<StoredSession>;
      if (!minted.connection_token || !minted.ws_url) {
        log('Session mint returned an unexpected response; will retry.');
        return null;
      }
      // Re-mint shortly before the 12h connection-token TTL.
      const stored: StoredSession = {
        connection_token: minted.connection_token,
        ws_url: minted.ws_url,
        expires: Date.now() + 11 * 60 * 60 * 1000,
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(stored));
      } catch {
        /* storage disabled/full: fall back to an in-memory session */
      }
      log('Minted a new session (saved for reuse across reloads).');
      return stored;
    }

    function scheduleReconnect() {
      if (closed) return;
      attempt += 1;
      const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      setStatus('reconnecting');
      log(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${attempt}).`);
      reconnectTimer = setTimeout(() => void connect(), delay);
    }

    function handleInvoke(
      callId: string,
      toolName: string,
      args: Record<string, unknown>,
    ) {
      log(`invoke ${toolName}(${JSON.stringify(args)})`);
      const spec = listToolsRef.current().find((t) => t.name === toolName);
      if (!spec) {
        send({
          type: 'result',
          call_id: callId,
          result: null,
          error: `Unknown tool: ${toolName}`,
        });
        return;
      }
      if (!spec.mutation) {
        void runAndRespond(callId, spec, args);
        return;
      }
      // Mutation: hold the invoke until the user decides.
      const controller = new AbortController();
      running.add(controller);
      log(`awaiting confirmation for ${toolName}`);
      void requestConfirmationRef
        .current(spec, args, {
          callId,
          windowSeconds: confirmationWindowSeconds,
          signal: controller.signal,
        })
        .then((decision) => {
          running.delete(controller);
          if (decision === 'approved') {
            log(`approved ${toolName}`);
            void runAndRespond(callId, spec, args);
          } else if (decision === 'denied' || decision === 'expired') {
            // Answer now: an unanswered harness would otherwise wait for the
            // relay's invoke timeout and get a generic error.
            log(
              decision === 'denied'
                ? `denied ${toolName}`
                : `confirmation for ${toolName} expired`,
            );
            send({
              type: 'result',
              call_id: callId,
              result: null,
              error: denialMessage(decision),
            });
          }
          // cancelled: the back-channel closed; there is no one to answer.
        });
    }

    async function connect() {
      try {
        acceptedRef.current = false;
        let stored = loadStored();
        if (stored) {
          log('Reusing the saved session (token is stable across reloads).');
        } else {
          stored = await mintSession();
          if (!stored) {
            scheduleReconnect();
            return;
          }
        }
        if (closed) return;
        setConnectionToken(stored.connection_token);
        setStatus('ready');

        const session = stored;
        const ws = new WebSocket(session.ws_url);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: 'hello',
              tab_id: crypto.randomUUID(),
              origin: location.origin,
              url: location.href,
              title,
              connection_token: session.connection_token,
            }),
          );
        };

        ws.onmessage = (event) => {
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(event.data as string);
          } catch {
            log('Ignored a malformed frame from the relay.');
            return;
          }
          switch (msg['type']) {
            case 'hello/accepted':
              attempt = 0; // back-channel established: reset backoff
              acceptedRef.current = true;
              log('Back-channel connected; advertising tools.');
              advertiseTools();
              break;
            case 'hello/rejected':
              // Stale/invalid token: drop the saved session so the next
              // reconnect mints a fresh one rather than looping on a bad token.
              log('Session rejected by relay; clearing it and re-pairing.');
              try {
                localStorage.removeItem(storageKey);
              } catch {
                /* storage disabled: nothing to clear */
              }
              break;
            case 'harness_status':
              setStatus(msg['attached'] ? 'connected' : 'ready');
              break;
            case 'invoke':
              handleInvoke(
                msg['call_id'] as string,
                (msg['tool_name'] as string) ?? '',
                (msg['args'] as Record<string, unknown>) ?? {},
              );
              break;
            case 'ping':
              send({ type: 'pong' });
              break;
            default:
              break;
          }
        };

        ws.onerror = () => {
          log('WebSocket error; the connection will be retried.');
        };

        ws.onclose = () => {
          acceptedRef.current = false;
          abortRunning();
          if (!closed) scheduleReconnect();
        };
      } catch (err) {
        log(`Error: ${(err as Error).message}`);
        scheduleReconnect();
      }
    }

    void connect();

    return () => {
      closed = true;
      abortRunning();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [
    relayBaseUrl,
    storageKey,
    title,
    confirmationWindowSeconds,
    log,
    send,
    advertiseTools,
    runAndRespond,
  ]);

  // Re-advertise when the registered tool set changes mid-connection.
  const toolSignature = registry.tools.map((t) => t.name).join(',');
  useEffect(() => {
    if (acceptedRef.current) {
      advertiseTools();
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `toolSignature` is a deliberate trigger-only dep; see the PR description.
  }, [toolSignature, advertiseTools]);

  return {
    status,
    connectionToken,
    activity,
    pendingConfirmation,
    pendingQueueLength,
    approve,
    deny,
  };
}
