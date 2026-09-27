/**
 * Human-in-the-loop confirmation for `mutation: true` tools.
 *
 * One queue per <WebMCPProvider>, shared by every path a tool can be invoked
 * on (document.modelContext, the MCP-B bridge, the relay back-channel), so a
 * mutation never runs without the user's approval whichever agent called it,
 * and one dialog serves them all. Framework-free: React reads it through
 * useSyncExternalStore.
 */
import type { PendingCallPrompt, ToolSpec } from './types.js';

/**
 * How a confirmation ended. `cancelled` means the caller went away (its
 * signal aborted, or the provider unmounted) before the user answered.
 */
export type ConfirmationDecision =
  | 'approved'
  | 'denied'
  | 'expired'
  | 'cancelled';

export interface ConfirmationOptions {
  /** Seconds before an unanswered prompt expires (and the call is denied). */
  windowSeconds: number;
  /** Reuse the caller's id (the relay's call_id); generated when omitted. */
  callId?: string;
  /** Aborting it withdraws the prompt with a `cancelled` decision. */
  signal?: AbortSignal;
}

type Held = {
  prompt: PendingCallPrompt;
  settle: (decision: ConfirmationDecision) => void;
};

export class ConfirmationQueue {
  private held: Held[] = [];
  private snapshot: readonly PendingCallPrompt[] = [];
  private readonly listeners = new Set<() => void>();
  private counter = 0;

  /** Queue a prompt for `spec` and resolve once the user (or the clock) decides. */
  request(
    spec: Pick<ToolSpec, 'name' | 'confirmationSummary'>,
    args: Record<string, unknown>,
    { windowSeconds, callId, signal }: ConfirmationOptions,
  ): Promise<ConfirmationDecision> {
    if (signal?.aborted) return Promise.resolve('cancelled');
    const id = callId ?? `local-${(this.counter += 1)}`;
    // A re-delivered call is already on screen; the original prompt answers it.
    if (this.held.some((h) => h.prompt.callId === id)) {
      return Promise.resolve('cancelled');
    }
    return new Promise((resolve) => {
      const now = new Date();
      const prompt: PendingCallPrompt = {
        callId: id,
        toolName: spec.name,
        summary: summarize(spec, args),
        argsPreview: args,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + windowSeconds * 1000).toISOString(),
      };
      let done = false;
      const onAbort = () => settle('cancelled');
      const timer = setTimeout(() => settle('expired'), windowSeconds * 1000);
      const settle = (decision: ConfirmationDecision) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.held = this.held.filter((h) => h.prompt !== prompt);
        this.publish();
        resolve(decision);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.held.push({ prompt, settle });
      this.publish();
    });
  }

  /** Answer the prompt at the head of the queue. */
  resolveHead(decision: 'approved' | 'denied'): void {
    this.held[0]?.settle(decision);
  }

  /** Withdraw every prompt (e.g. the provider unmounted). */
  cancelAll(): void {
    for (const h of [...this.held]) h.settle('cancelled');
  }

  getSnapshot = (): readonly PendingCallPrompt[] => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(): void {
    this.snapshot = this.held.map((h) => h.prompt);
    for (const listener of this.listeners) listener();
  }
}

function summarize(
  spec: Pick<ToolSpec, 'name' | 'confirmationSummary'>,
  args: Record<string, unknown>,
): string {
  try {
    return spec.confirmationSummary?.(args as never) ?? spec.name;
  } catch {
    // A throwing summary must not bypass or wedge the gate: fall back to the
    // tool name so the user can still decide.
    return spec.name;
  }
}

/**
 * The error message an agent receives when a mutation was not approved.
 *
 * A denial is reported as a failed call (a rejected execute, an MCP
 * `isError` result), not as a result object: a tool that declares an
 * `outputSchema` would otherwise hand the agent an object that fails its own
 * schema, and MCP servers and clients reject that as a broken tool. The
 * message says the user declined, so an agent can tell it from a bug and does
 * not retry blindly.
 */
export function denialMessage(decision: 'denied' | 'expired'): string {
  return decision === 'expired'
    ? 'The user did not approve this call before the confirmation request expired; it was not run.'
    : 'The user denied this call; it was not run.';
}

/** Signature the registration layer uses to ask for approval. */
export type RequestConfirmation = (
  spec: Pick<ToolSpec, 'name' | 'confirmationSummary'>,
  args: Record<string, unknown>,
  options?: Partial<ConfirmationOptions>,
) => Promise<ConfirmationDecision>;
