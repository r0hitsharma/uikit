/* eslint-disable no-underscore-dangle -- the registry exposes internal-by-convention methods (_addSpec, _contributeViewState) that the public hooks wrap. */
/**
 * WebMCPProvider
 *
 * Wraps @mcp-b/global initialization (installs the document.modelContext
 * polyfill) and exposes a ToolRegistryContext so that useRegisterTool /
 * useToolRegistry hooks can work together without redundant polyfill calls.
 *
 * Absorbs @mcp-b churn: callers never import @mcp-b/* directly.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { ConfirmationQueue, type RequestConfirmation } from './confirmation.js';
import {
  cleanupWebModelContext,
  hostModelContextOptions,
  initializeWebModelContext,
  type TransportConfiguration,
} from './mcp-b.js';
import { flushToolRegistrations, getModelContext } from './registration.js';
import type { ToolSpec, ViewState } from './types.js';

// ---------------------------------------------------------------------------
// ToolRegistryContext
// ---------------------------------------------------------------------------

/**
 * Internal registry kept by the provider so `listTools` and `getViewState`
 * have something to read synchronously.
 *
 * Registration is additive: each `useRegisterTool` call pushes its spec into
 * the registry while mounted and removes it on unmount.
 */
export interface ToolRegistryContextValue {
  /**
   * Snapshot of all currently-registered tool specs.
   * Re-computed whenever any tool mounts or unmounts.
   */
  tools: ToolSpec[];

  /**
   * Returns a snapshot of every registered tool spec at call time.
   */
  listTools: () => ToolSpec[];

  /**
   * Returns the current view state aggregated from all registered context
   * contributions.  Starts empty; components hydrate it via setViewState.
   */
  getViewState: () => ViewState;

  /**
   * Called by hooks to add a spec to the registry.
   * Returns a cleanup function that removes it.
   */
  _addSpec: (spec: ToolSpec) => () => void;

  /**
   * Called by view-state contributor hooks to merge partial state.
   * Returns a cleanup function that removes the contribution.
   */
  _contributeViewState: (partial: ViewState) => () => void;

  /**
   * The provider's mutation-confirmation queue, shared by every invocation
   * path (document.modelContext and the relay).
   */
  _confirmationQueue: ConfirmationQueue;

  /**
   * Ask the user to approve a mutation. Resolves with the decision; the
   * window defaults to the provider's `confirmationWindowSeconds`.
   */
  _requestConfirmation: RequestConfirmation;
}

const ToolRegistryContext = createContext<ToolRegistryContextValue | null>(
  null,
);

// ---------------------------------------------------------------------------
// WebMCPProvider
// ---------------------------------------------------------------------------

/** Origins allowed to talk to one MCP-B postMessage transport. */
export interface WebMCPTransportEndpoint {
  /**
   * Origins allowed to connect. `['*']` disables origin validation; pass it
   * only deliberately.
   */
  allowedOrigins: readonly string[];
  /** Channel name; MCP-B's default when omitted. */
  channelId?: string;
}

/**
 * Which MCP-B transports the polyfill exposes tools on, and to whom. This
 * governs the MCP-B bridge only: a browser's native `document.modelContext`
 * (and its own agent) is not affected.
 */
export interface WebMCPTransportOptions {
  /**
   * Same-window transport, used by the MCP-B browser extension.
   * `false` disables it.
   * @default { allowedOrigins: [window.location.origin] }
   */
  tabServer?: WebMCPTransportEndpoint | false;
  /**
   * Transport to a parent frame, used instead of `tabServer` when the page is
   * embedded in an iframe. Off unless configured: name the embedding origins.
   * @default false
   */
  iframeServer?: WebMCPTransportEndpoint | false;
}

export interface WebMCPProviderProps {
  children: ReactNode;
  /**
   * Pass `false` to skip polyfill initialization (useful in tests or SSR).
   * @default true
   */
  initPolyfill?: boolean;
  /**
   * MCP-B transport configuration. The default accepts connections from the
   * page's own origin only; @mcp-b/global's own default accepts any origin.
   * When unset, a transport the host page set in
   * `window.__webModelContextOptions` applies instead. Changing it
   * re-initializes the polyfill.
   */
  transport?: WebMCPTransportOptions;
  /**
   * Seconds a mutation confirmation stays open before it expires and the call
   * is denied. Applies to calls made through document.modelContext;
   * useRelaySession passes its own (shorter) window for relay calls. The
   * default stays under the MCP SDK's 60 s request timeout, so an MCP-B client
   * gets the denial instead of timing out while a late approval still runs.
   * @default 50
   */
  confirmationWindowSeconds?: number;
}

/**
 * Resolve the provider's transport prop to @mcp-b/global's configuration. The
 * host page's own transport applies when the prop is not set.
 */
function resolveTransport(
  transport: WebMCPTransportOptions | undefined,
  hostTransport: TransportConfiguration | undefined,
): TransportConfiguration {
  if (transport === undefined && hostTransport !== undefined) {
    return hostTransport;
  }
  return {
    tabServer:
      transport?.tabServer === undefined
        ? { allowedOrigins: [window.location.origin] }
        : transport.tabServer,
    iframeServer: transport?.iframeServer ?? false,
  };
}

let warnedNoModelContext = false;

/**
 * Tools are still listed locally (listTools, the relay) when nothing is
 * installed, so say once why browser agents cannot see them.
 */
function warnNoModelContext(): void {
  if (warnedNoModelContext) return;
  warnedNoModelContext = true;
  console.warn(
    globalThis.isSecureContext === false
      ? "[webmcp] no document.modelContext: WebMCP and the MCP-B polyfill need a secure context (https or localhost), so browser agents cannot see this page's tools. The relay back-channel is not affected."
      : "[webmcp] no document.modelContext after initializing the polyfill, so browser agents cannot see this page's tools.",
  );
}

/**
 * Mount this provider once near the root of your React tree before using
 * any hooks from @r0hitsharma/webmcp.
 *
 * @example
 * ```tsx
 * import { WebMCPProvider } from '@r0hitsharma/webmcp';
 *
 * function App() {
 *   return (
 *     <WebMCPProvider>
 *       <Explorer />
 *     </WebMCPProvider>
 *   );
 * }
 * ```
 */
export function WebMCPProvider({
  children,
  initPolyfill = true,
  transport,
  confirmationWindowSeconds = 50,
}: WebMCPProviderProps) {
  // Stable refs so the context value object is referentially stable.
  const toolMapRef = useRef<Map<string, ToolSpec>>(new Map());
  const viewStateRef = useRef<Map<string, ViewState>>(new Map());
  // `tools` is exposed to render via `useSyncExternalStore` — refs aren't
  // safe to read during render, so `toolMapRef` itself never is; `bump`
  // recomputes a snapshot array and notifies subscribers instead.
  const toolsSnapshotRef = useRef<ToolSpec[]>([]);
  const listenersRef = useRef(new Set<() => void>());
  const subscribeTools = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);
  const getToolsSnapshot = useCallback(() => toolsSnapshotRef.current, []);
  const bump = useCallback(() => {
    toolsSnapshotRef.current = Array.from(toolMapRef.current.values());
    for (const listener of listenersRef.current) listener();
  }, []);

  // Initialize the document.modelContext polyfill on mount. This effect runs
  // after the children's registration effects, so flush the registrations
  // they already hold onto the (possibly new) context.
  //
  // Keyed on the serialized transport so an inline `transport={{...}}` object
  // does not tear the polyfill down on every render.
  const transportKey = JSON.stringify(transport ?? null);
  useEffect(() => {
    if (!initPolyfill) return;
    const configured = JSON.parse(
      transportKey,
    ) as WebMCPTransportOptions | null;
    const host = hostModelContextOptions();
    if (host?.autoInitialize === true) {
      // The host page opted in to @mcp-b/global's import-time start, so it
      // owns that instance: do not re-configure or tear it down.
      if (configured) {
        console.warn(
          "[webmcp] window.__webModelContextOptions.autoInitialize is true, so @mcp-b/global started itself with the host page's transport; WebMCPProvider's transport prop has no effect.",
        );
      }
      flushToolRegistrations();
      return undefined;
    }
    try {
      initializeWebModelContext({
        ...(host?.installTestingShim !== undefined
          ? { installTestingShim: host.installTestingShim }
          : {}),
        transport: resolveTransport(configured ?? undefined, host?.transport),
      });
    } catch (error) {
      // e.g. every transport disabled: @mcp-b/global refuses to start, after
      // installing its polyfill. Tools still register on that polyfill's
      // document.modelContext, but no MCP-B transport serves them.
      console.error('[webmcp] polyfill initialization failed:', error);
    }
    if (!getModelContext()) warnNoModelContext();
    flushToolRegistrations();
    return () => {
      cleanupWebModelContext();
    };
  }, [initPolyfill, transportKey]);

  // One queue per provider, alive for its lifetime; prompts still open when
  // the provider unmounts are withdrawn so their callers settle.
  const [confirmationQueue] = useState(() => new ConfirmationQueue());
  useEffect(() => () => confirmationQueue.cancelAll(), [confirmationQueue]);
  const _requestConfirmation = useCallback<RequestConfirmation>(
    (spec, args, options) =>
      confirmationQueue.request(spec, args, {
        ...options,
        windowSeconds: options?.windowSeconds ?? confirmationWindowSeconds,
      }),
    [confirmationQueue, confirmationWindowSeconds],
  );

  const _addSpec = useCallback(
    (spec: ToolSpec): (() => void) => {
      toolMapRef.current.set(spec.name, spec);
      bump();
      return () => {
        toolMapRef.current.delete(spec.name);
        bump();
      };
    },
    [bump],
  );

  const _contributeViewState = useCallback(
    (partial: ViewState): (() => void) => {
      // Use object identity as key.
      const key = Math.random().toString(36).slice(2);
      viewStateRef.current.set(key, partial);
      return () => {
        viewStateRef.current.delete(key);
      };
    },
    [],
  );

  const listTools = useCallback((): ToolSpec[] => {
    return Array.from(toolMapRef.current.values());
  }, []);

  const getViewState = useCallback((): ViewState => {
    const merged: ViewState = {};
    for (const partial of viewStateRef.current.values()) {
      Object.assign(merged, partial);
    }
    return merged;
  }, []);

  // No effect ever runs during server rendering, so `toolsSnapshotRef` is
  // still at its initial (empty) value then — safe to reuse `getToolsSnapshot`
  // as the server snapshot too.
  const tools = useSyncExternalStore(
    subscribeTools,
    getToolsSnapshot,
    getToolsSnapshot,
  );

  const value: ToolRegistryContextValue = {
    tools,
    listTools,
    getViewState,
    _addSpec,
    _contributeViewState,
    _confirmationQueue: confirmationQueue,
    _requestConfirmation,
  };

  return (
    <ToolRegistryContext.Provider value={value}>
      {children}
    </ToolRegistryContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Internal hook to access the registry context (throws if not mounted)
// ---------------------------------------------------------------------------

export function useToolRegistryContext(): ToolRegistryContextValue {
  const ctx = useContext(ToolRegistryContext);
  if (!ctx) {
    throw new Error(
      '[web-mcp] useToolRegistryContext called outside <WebMCPProvider>. ' +
        'Wrap your app (or at least the component tree that uses @r0hitsharma/webmcp hooks) ' +
        'with <WebMCPProvider>.',
    );
  }
  return ctx;
}
