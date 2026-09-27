import { describe, expect, it } from 'vitest';

import type { ToolDefinition } from '../protocol.js';
import { RelaySession, toCallToolResult, toMcpTool } from '../session.js';

const schema = { type: 'object' as const, properties: {} };

function def(extra: Partial<ToolDefinition> = {}): ToolDefinition {
  return { name: 't', description: 'A tool.', input_schema: schema, ...extra };
}

describe('toMcpTool', () => {
  it('forwards title and outputSchema', () => {
    expect(
      toMcpTool(
        def({
          title: 'Tool',
          output_schema: { type: 'object', properties: {} },
        }),
      ),
    ).toEqual({
      name: 't',
      title: 'Tool',
      description: 'A tool.',
      inputSchema: schema,
      outputSchema: { type: 'object', properties: {} },
    });
  });

  it('maps a consequential tool to readOnlyHint:false + destructiveHint:true', () => {
    expect(
      toMcpTool(
        def({
          mutation: true,
          annotations: { readOnlyHint: false, consequentialHint: true },
        }),
      ).annotations,
    ).toEqual({ readOnlyHint: false, destructiveHint: true });
  });

  it('maps a read-only tool to readOnlyHint:true without destructiveHint', () => {
    expect(
      toMcpTool(
        def({ annotations: { readOnlyHint: true, consequentialHint: false } }),
      ).annotations,
    ).toEqual({ readOnlyHint: true });
  });

  it('keeps a non-read-only, non-consequential tool non-destructive', () => {
    expect(
      toMcpTool(
        def({ annotations: { readOnlyHint: false, consequentialHint: false } }),
      ).annotations,
    ).toEqual({ readOnlyHint: false, destructiveHint: false });
  });

  it('derives hints from mutation for a browser that sends no annotations', () => {
    expect(toMcpTool(def({ mutation: true })).annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it('emits no annotations when there is nothing to go on', () => {
    expect(toMcpTool(def())).not.toHaveProperty('annotations');
  });

  it('does not forward untrustedContentHint (no MCP counterpart)', () => {
    expect(
      toMcpTool(def({ annotations: { untrustedContentHint: true } })),
    ).not.toHaveProperty('annotations');
  });
});

describe('listToolsResult', () => {
  it('no longer drops mutation: it reaches MCP as destructive', () => {
    const s = new RelaySession('s');
    s.setTools([def({ name: 'mutate', mutation: true })]);
    const result = s.listToolsResult(1) as {
      result: { tools: Array<{ annotations?: Record<string, boolean> }> };
    };
    expect(result.result.tools[0]?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });
});

describe('toCallToolResult', () => {
  it('maps an error to isError: true', () => {
    expect(toCallToolResult(null, 'no such identity')).toEqual({
      content: [{ type: 'text', text: 'no such identity' }],
      isError: true,
    });
  });

  it('maps an empty error to isError: true, not a success', () => {
    expect(toCallToolResult(null, '')).toEqual({
      content: [{ type: 'text', text: 'The tool call failed.' }],
      isError: true,
    });
  });

  it('passes an object result through as structuredContent', () => {
    expect(toCallToolResult({ selected: 'a' })).toEqual({
      content: [{ type: 'text', text: '{"selected":"a"}' }],
      structuredContent: { selected: 'a' },
    });
  });

  it('keeps strings as text and arrays out of structuredContent', () => {
    expect(toCallToolResult('done')).toEqual({
      content: [{ type: 'text', text: 'done' }],
    });
    expect(toCallToolResult([1, 2])).toEqual({
      content: [{ type: 'text', text: '[1,2]' }],
    });
  });

  it('passes a ready-made CallToolResult through', () => {
    const ready = { content: [{ type: 'text', text: 'x' }], isError: false };
    expect(toCallToolResult(ready)).toBe(ready);
  });

  it('frames a JSON-RPC response', () => {
    expect(new RelaySession('s').callToolResult(7, { ok: true })).toEqual({
      jsonrpc: '2.0',
      id: 7,
      result: {
        content: [{ type: 'text', text: '{"ok":true}' }],
        structuredContent: { ok: true },
      },
    });
  });
});
