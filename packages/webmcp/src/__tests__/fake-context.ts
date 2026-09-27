/**
 * A minimal spec-shaped `document.modelContext` for unit tests: registerTool
 * returns a Promise, rejects duplicates, and unregisters on signal abort.
 */
export type FakeTool = Record<string, unknown> & {
  name: string;
  execute: (input: unknown, options?: { signal?: AbortSignal }) => unknown;
};

export type FakeContext = {
  tools: Map<string, FakeTool>;
  calls: FakeTool[];
  registerTool: (
    tool: FakeTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
  /** When set, the next registerTool waits for this before settling. */
  gate?: Promise<void>;
  /** When set, registerTool rejects with this error. */
  failWith?: unknown;
};

export function installFakeContext(): FakeContext {
  const ctx: FakeContext = {
    tools: new Map(),
    calls: [],
    async registerTool(tool, options) {
      ctx.calls.push(tool);
      if (ctx.gate) await ctx.gate;
      if (ctx.failWith) throw ctx.failWith;
      options?.signal?.throwIfAborted();
      if (ctx.tools.has(tool.name)) {
        throw new DOMException(
          `Tool already registered: ${tool.name}`,
          'InvalidStateError',
        );
      }
      ctx.tools.set(tool.name, tool);
      options?.signal?.addEventListener('abort', () => {
        if (ctx.tools.get(tool.name) === tool) ctx.tools.delete(tool.name);
      });
    },
  };
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: ctx,
  });
  return ctx;
}

export function removeFakeContext(): void {
  Reflect.deleteProperty(document, 'modelContext');
}

export async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}
