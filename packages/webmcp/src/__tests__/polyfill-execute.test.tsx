/**
 * End to end through the real @mcp-b/global polyfill: what an agent gets back
 * from `document.modelContext.executeTool` is the handler's result serialized
 * as JSON, not a serialized MCP `{content: [...]}` wrapper.
 */
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useRegisterTool } from '../hooks.js';
import { WebMCPProvider } from '../provider.js';
import { defineTool } from '../types.js';
import { modelContextToolNames, settle } from './helpers.js';

type RegisteredTool = { name: string };
type Context = {
  getTools: () => Promise<RegisteredTool[]>;
  executeTool: (tool: RegisteredTool, input: string) => Promise<string>;
};

function SelectTool() {
  useRegisterTool(
    defineTool({
      name: 'e2e.select',
      description: 'Select an identity.',
      schema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }: { id: string }) => ({ selected: id }),
    }),
  );
  return null;
}

it('executeTool returns the plain handler result as JSON', async () => {
  render(
    <WebMCPProvider>
      <SelectTool />
    </WebMCPProvider>,
  );
  await settle();
  await vi.waitFor(() =>
    expect(modelContextToolNames()).toContain('e2e.select'),
  );
  const ctx = (document as unknown as { modelContext: Context }).modelContext;
  const tool = (await ctx.getTools()).find((t) => t.name === 'e2e.select')!;
  const output = await ctx.executeTool(tool, JSON.stringify({ id: 'a-1' }));
  expect(JSON.parse(output)).toEqual({ selected: 'a-1' });
});
