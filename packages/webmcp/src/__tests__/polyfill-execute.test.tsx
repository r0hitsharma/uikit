/**
 * End to end through the real @mcp-b/global polyfill: what an agent gets back
 * from `document.modelContext.executeTool` is the handler's result serialized
 * as JSON, not a serialized MCP `{content: [...]}` wrapper; and what an MCP
 * client of the bridge gets when the user denies a mutation.
 */
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { expect, it, vi } from 'vitest';

import {
  useRegisterTool,
  useToolConfirmation,
  type ToolConfirmation,
} from '../hooks.js';
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

type JsonRpc = { jsonrpc: '2.0'; id?: number; [key: string]: unknown };
type Transport = {
  start: () => Promise<void>;
  send: (message: JsonRpc) => Promise<void>;
  close: () => Promise<void>;
  onmessage?: (message: JsonRpc) => void;
};
type Bridge = {
  mcpServer: {
    close: () => Promise<void>;
    connect: (t: Transport) => Promise<void>;
  };
};

/** A client wired straight to the bridge's McpServer, in memory. */
async function connectMcpClient() {
  const bridge = (document as unknown as { modelContext: Bridge }).modelContext;
  // The provider connected the server to its postMessage transport; swap in ours.
  await bridge.mcpServer.close();
  const replies = new Map<number, (message: JsonRpc) => void>();
  const serverSide: Transport = {
    start: async () => {},
    send: async (message) => {
      if (message.id !== undefined) replies.get(message.id)?.(message);
    },
    close: async () => {},
  };
  await bridge.mcpServer.connect(serverSide);
  let nextId = 0;
  const request = (method: string, params: unknown) =>
    new Promise<JsonRpc>((resolve) => {
      nextId += 1;
      replies.set(nextId, resolve);
      serverSide.onmessage?.({ jsonrpc: '2.0', id: nextId, method, params });
    });
  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
  serverSide.onmessage?.({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
  return request;
}

const latest: { confirmation?: ToolConfirmation } = {};

function CreateTool() {
  useRegisterTool(
    defineTool({
      name: 'e2e.create',
      description: 'Create a record.',
      schema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      mutation: true,
      confirmationSummary: () => 'Create a record.',
      handler: () => ({ id: 'r-1' }),
    }),
  );
  const confirmation = useToolConfirmation();
  useEffect(() => {
    latest.confirmation = confirmation;
  });
  return null;
}

it('a denied mutation with an outputSchema reaches MCP clients as a denial error', async () => {
  render(
    <WebMCPProvider>
      <CreateTool />
    </WebMCPProvider>,
  );
  await settle();
  await vi.waitFor(() =>
    expect(modelContextToolNames()).toContain('e2e.create'),
  );
  const request = await connectMcpClient();
  const call = request('tools/call', { name: 'e2e.create', arguments: {} });
  await vi.waitFor(() =>
    expect(latest.confirmation?.pendingConfirmation?.toolName).toBe(
      'e2e.create',
    ),
  );
  act(() => latest.confirmation!.deny());
  const reply = await call;
  // Not "Output validation error": the schema is never checked against a
  // denial, and the agent is told the user declined.
  expect(reply['result']).toMatchObject({
    isError: true,
    content: [{ type: 'text', text: expect.stringContaining('denied') }],
  });
});
