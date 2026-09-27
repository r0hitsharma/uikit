/**
 * StrictMode-safe tool registration against the WebMCP polyfill.
 *
 * Why this exists: the pinned `@mcp-b` polyfill bridges `document.modelContext`
 * (a Map with AbortSignal-based unregister) to an underlying McpServer whose
 * `_registeredTools` is synced via `queueMicrotask`. React StrictMode mounts
 * effects mount -> unmount -> mount synchronously, which races that microtask
 * sync and makes the McpServer throw `Tool <name> is already registered`,
 * crashing the app in dev. (This is the kind of @mcp-b churn the wrapper is
 * meant to absorb; see decision 8 / the plan's section 8.)
 *
 * The fix: register each tool name exactly once, refcounted. A transient
 * unmount/remount in the same tick re-acquires the existing registration
 * instead of abort+re-add, so the polyfill never sees a duplicate. The real
 * unregister (signal abort) only fires once the last holder is gone, deferred
 * to a microtask so a StrictMode remount can cancel it.
 */
import { denialResult, type RequestConfirmation } from './confirmation.js';
import { resolveAnnotations, type ToolSpec } from './types.js';

type ModelContext = {
  /**
   * Per the WebMCP spec this returns a Promise that rejects on a duplicate
   * name, an invalid descriptor, or an aborted signal. Typed `unknown` so an
   * older synchronous implementation is handled too.
   */
  registerTool: (
    tool: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ) => unknown;
};

/** One registration attempt against one modelContext instance. */
type Binding = {
  context: ModelContext;
  // Aborting it unregisters the tool, or cancels a still-pending registerTool.
  controller: AbortController;
};

type Entry = {
  count: number;
  // Latest spec, so re-acquiring with new deps swaps the handler in place
  // without re-registering (which the polyfill would reject as a duplicate).
  spec: ToolSpec;
  binding?: Binding;
  // Latest holder's confirmation gate for mutation calls.
  requestConfirmation?: RequestConfirmation;
};

export interface AcquireOptions {
  /** Approval gate for `mutation: true` tools; without one they are denied. */
  requestConfirmation?: RequestConfirmation;
}

const REGISTRY = new Map<string, Entry>();

/** Resolve the polyfilled model context, preferring the current draft location. */
function getModelContext(): ModelContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const doc = window.document as unknown as { modelContext?: ModelContext };
  const nav = window.navigator as unknown as { modelContext?: ModelContext };
  return doc?.modelContext ?? nav?.modelContext;
}

function isDuplicateError(error: unknown): boolean {
  return /already registered/i.test(String(error));
}

/**
 * Acquire a registration for `spec`. Returns a release function to call on
 * unmount. Idempotent per tool name: concurrent holders share one underlying
 * polyfill registration.
 */
export function acquireToolRegistration(
  spec: ToolSpec,
  options: AcquireOptions = {},
): () => void {
  const existing = REGISTRY.get(spec.name);
  if (existing) {
    existing.count += 1;
    existing.spec = spec; // keep the freshest handler/description
    existing.requestConfirmation =
      options.requestConfirmation ?? existing.requestConfirmation;
    // Re-bind if the context changed underneath (e.g. the provider re-created
    // the polyfill); a no-op when already bound to the current one.
    bind(spec.name, existing);
    return makeRelease(spec.name);
  }

  const entry: Entry = {
    count: 1,
    spec,
    requestConfirmation: options.requestConfirmation,
  };
  REGISTRY.set(spec.name, entry);
  bind(spec.name, entry);
  return makeRelease(spec.name);
}

/**
 * Bind every held registration to the current modelContext.
 *
 * React runs a parent's effects after its children's, so the provider's
 * polyfill initialization always comes after the first `useRegisterTool`
 * effects. Those registrations either found no context (none installed yet) or
 * bound to one the provider then replaced (StrictMode's effect re-run closes
 * the polyfill's server and creates another, which starts empty; so does a
 * transport change). The provider calls this right after initializing, so every
 * held tool lands on the context that is actually live.
 */
export function flushToolRegistrations(): void {
  for (const [name, entry] of REGISTRY) {
    if (entry.count > 0) bind(name, entry);
  }
}

/**
 * Register `entry` with the current modelContext. `registerTool` is async, so
 * its outcome is handled on the returned promise, never with a synchronous
 * try/catch (which would leave every rejection unhandled).
 */
function bind(name: string, entry: Entry): void {
  const context = getModelContext();
  if (!context) {
    // No polyfill (SSR / unsupported browser): keep the refcount bookkeeping so
    // listTools()-style local state still balances, but skip the global call.
    return;
  }
  if (entry.binding?.context === context) return;
  // Bound to a context that has since been replaced: drop that registration
  // (a no-op on a closed server) before registering with the live one.
  entry.binding?.controller.abort();

  const controller = new AbortController();
  entry.binding = { context, controller };

  // WebMCP JSON-serializes whatever execute resolves to and treats a
  // rejection as a failed call, so return the handler's own result and let
  // errors throw. A bridge that needs an MCP CallToolResult builds one: the
  // MCP-B bridge wraps a plain result (text + structuredContent) and turns a
  // throw into `isError: true`.
  const execute = async (
    args: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<unknown> => {
    // The spec passes a per-call signal (MCP-B 5.1.0 passes none); also abort
    // if this registration goes away mid-call.
    const signal = options?.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    // Read the latest spec so deps-driven handler updates take effect without
    // re-registering against the polyfill.
    const current = entry.spec;
    if (current.mutation) {
      // Same gate as the relay path: nothing runs without the user's approval.
      // No gate available fails closed.
      const decision = entry.requestConfirmation
        ? await entry.requestConfirmation(current, args, { signal })
        : 'denied';
      if (decision === 'cancelled') {
        signal.throwIfAborted();
        throw new Error('The confirmation request was withdrawn.');
      }
      if (decision !== 'approved') return denialResult(decision);
    }
    return current.handler(args as never, { signal });
  };

  let pending: Promise<unknown>;
  try {
    pending = Promise.resolve(
      context.registerTool(
        {
          name: entry.spec.name,
          ...(entry.spec.title !== undefined
            ? { title: entry.spec.title }
            : {}),
          description: entry.spec.description,
          inputSchema: entry.spec.schema,
          // Not in WebMCP (a native modelContext ignores it); the MCP-B bridge
          // forwards it to MCP clients.
          ...(entry.spec.outputSchema !== undefined
            ? { outputSchema: entry.spec.outputSchema }
            : {}),
          // WebMCP hints (there is no destructiveHint in WebMCP). A bridge to
          // MCP forwards readOnlyHint; MCP reads readOnlyHint:false as
          // destructive by default, so mutations stay flagged there too.
          annotations: resolveAnnotations(entry.spec),
          execute,
        },
        { signal: controller.signal },
      ),
    );
  } catch (error) {
    pending = Promise.reject(error);
  }

  pending.catch((error: unknown) => {
    // Released (or re-bound) before registerTool settled: the rejection is the
    // abort we asked for, not a failure.
    if (controller.signal.aborted) return;
    if (isDuplicateError(error)) {
      // Another registration of this name already exists on the context (a
      // stale one from a prior race, or a second copy of this package). It
      // stays usable, so treat the tool as present rather than failing.
      console.warn(
        `[webmcp] tool "${name}" is already registered on document.modelContext; keeping the existing registration.`,
      );
      return;
    }
    // The bookkeeping stays balanced (the entry keeps its refcount, and the
    // release still runs); only the global exposure failed. Surface it.
    console.error(`[webmcp] registering tool "${name}" failed:`, error);
  });
}

function makeRelease(name: string): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const entry = REGISTRY.get(name);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count > 0) return;
    // Defer the abort so a StrictMode remount in the same tick can re-acquire
    // (bumping count back above zero) and cancel the teardown.
    queueMicrotask(() => {
      const current = REGISTRY.get(name);
      if (current && current.count === 0) {
        current.binding?.controller.abort();
        REGISTRY.delete(name);
      }
    });
  };
}
