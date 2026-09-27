import { act } from '@testing-library/react';

import { useRegisterTool } from '../hooks.js';
import { defineTool } from '../types.js';

type BridgedContext = { listTools?: () => Array<{ name: string }> };

/** Tool names on the bridged `document.modelContext` (MCP-B's `listTools()`). */
export function modelContextToolNames(): string[] {
  const ctx = (document as unknown as { modelContext?: BridgedContext })
    .modelContext;
  return ctx?.listTools?.().map((t) => t.name) ?? [];
}

/** Let deferred unregisters, polyfill syncs and timers settle. */
export async function settle(ms = 20): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

export function ReadTool({ name }: { name: string }) {
  useRegisterTool(
    defineTool({
      name,
      description: `Test tool ${name}.`,
      schema: { type: 'object', properties: {} },
      handler: () => ({ ok: true }),
    }),
  );
  return null;
}
