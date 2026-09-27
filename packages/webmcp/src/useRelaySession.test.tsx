import { act, cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installRelayFakes, openedSocket } from './__tests__/relay-harness.js';
import { useRegisterTool } from './hooks.js';
import { WebMCPProvider } from './provider.js';
import type { ToolSpec } from './types.js';
import {
  useRelaySession,
  type UseRelaySessionResult,
} from './useRelaySession.js';

// Latest hook result, published from an effect (render must stay pure).
const latest: { session?: UseRelaySessionResult } = {};

function ToolMount({ spec }: { spec: ToolSpec }) {
  useRegisterTool(spec);
  return null;
}

function Session({ windowSeconds = 1 }: { windowSeconds?: number }) {
  const result = useRelaySession({
    relayBaseUrl: 'https://relay.test',
    storageKey: 'relay-test',
    confirmationWindowSeconds: windowSeconds,
  });
  useEffect(() => {
    latest.session = result;
  });
  return null;
}

function mount(tools: ToolSpec[], windowSeconds?: number) {
  return render(
    <WebMCPProvider initPolyfill={false}>
      {tools.map((spec) => (
        <ToolMount key={spec.name} spec={spec} />
      ))}
      <Session windowSeconds={windowSeconds} />
    </WebMCPProvider>,
  );
}

function tool(name: string, extra: Partial<ToolSpec> = {}): ToolSpec {
  return {
    name,
    description: `Test tool ${name}.`,
    schema: { type: 'object', properties: {} },
    handler: () => ({ ok: true }),
    ...extra,
  };
}

beforeEach(() => {
  installRelayFakes();
  latest.session = undefined;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('relay handler signal', () => {
  it('aborts a running handler when the back-channel closes', async () => {
    let seen: AbortSignal | undefined;
    mount([
      tool('relay.slow', {
        handler: (_args, context) => {
          seen = context?.signal;
          return new Promise(() => {});
        },
      }),
    ]);
    const ws = await openedSocket();
    await ws.serverOpen();
    await ws.serverSend({
      type: 'invoke',
      call_id: 'c-1',
      tool_name: 'relay.slow',
      args: {},
    });
    await vi.waitFor(() => expect(seen).toBeDefined());
    expect(seen?.aborted).toBe(false);
    await act(async () => ws.close());
    expect(seen?.aborted).toBe(true);
  });
});

describe('relay mutation confirmation', () => {
  const mutation = () =>
    tool('relay.mutate', {
      mutation: true,
      confirmationSummary: () => 'Change something.',
      handler: () => ({ changed: true }),
    });

  it('fails the call at once when the confirmation window is invalid', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = vi.fn();
    mount([tool('relay.bad', { mutation: true, handler })], Number.NaN);
    const ws = await openedSocket();
    await ws.serverOpen();
    await ws.serverSend({
      type: 'invoke',
      call_id: 'c-nan',
      tool_name: 'relay.bad',
      args: {},
    });
    await vi.waitFor(() =>
      expect(ws.framesOf('result')).toContainEqual({
        type: 'result',
        call_id: 'c-nan',
        result: null,
        error: expect.stringContaining('confirmationWindowSeconds'),
      }),
    );
    expect(handler).not.toHaveBeenCalled();
    expect(latest.session?.pendingConfirmation).toBeNull();
    error.mockRestore();
  });

  it('sends a denial error when the confirmation expires unanswered', async () => {
    mount([mutation()]);
    const ws = await openedSocket();
    await ws.serverOpen();
    await ws.serverSend({
      type: 'invoke',
      call_id: 'c-exp',
      tool_name: 'relay.mutate',
      args: {},
    });
    await vi.waitFor(() =>
      expect(latest.session?.pendingConfirmation?.callId).toBe('c-exp'),
    );
    // confirmationWindowSeconds is 1 in these tests.
    await vi.waitFor(
      () =>
        expect(ws.framesOf('result')).toContainEqual({
          type: 'result',
          call_id: 'c-exp',
          result: null,
          error: expect.stringContaining('confirmation request expired'),
        }),
      { timeout: 2500 },
    );
    expect(latest.session?.pendingConfirmation).toBeNull();
  });
});

describe('relay results', () => {
  it('returns a handler result in the result field', async () => {
    mount([tool('relay.ok', { handler: () => ({ selected: 'a' }) })]);
    const ws = await openedSocket();
    await ws.serverOpen();
    await ws.serverSend({
      type: 'invoke',
      call_id: 'c-ok',
      tool_name: 'relay.ok',
      args: {},
    });
    await vi.waitFor(() =>
      expect(ws.framesOf('result')).toContainEqual({
        type: 'result',
        call_id: 'c-ok',
        result: { selected: 'a' },
      }),
    );
  });

  it('reports a thrown handler error in the error field, not as a result', async () => {
    mount([
      tool('relay.throws', {
        handler: () => {
          throw new Error('no such identity');
        },
      }),
    ]);
    const ws = await openedSocket();
    await ws.serverOpen();
    await ws.serverSend({
      type: 'invoke',
      call_id: 'c-err',
      tool_name: 'relay.throws',
      args: {},
    });
    await vi.waitFor(() =>
      expect(ws.framesOf('result')).toContainEqual({
        type: 'result',
        call_id: 'c-err',
        result: null,
        error: 'no such identity',
      }),
    );
  });

  it('reports a throw with an empty message as an error, not a success', async () => {
    mount([
      tool('relay.silent', {
        handler: () => {
          throw new Error();
        },
      }),
    ]);
    const ws = await openedSocket();
    await ws.serverOpen();
    await ws.serverSend({
      type: 'invoke',
      call_id: 'c-empty',
      tool_name: 'relay.silent',
      args: {},
    });
    await vi.waitFor(() =>
      expect(ws.framesOf('result')).toContainEqual({
        type: 'result',
        call_id: 'c-empty',
        result: null,
        error: 'Tool "relay.silent" failed without an error message.',
      }),
    );
  });

  it('reports an unknown tool in the error field', async () => {
    mount([]);
    const ws = await openedSocket();
    await ws.serverOpen();
    await ws.serverSend({
      type: 'invoke',
      call_id: 'c-unknown',
      tool_name: 'relay.missing',
      args: {},
    });
    await vi.waitFor(() =>
      expect(ws.framesOf('result')).toContainEqual({
        type: 'result',
        call_id: 'c-unknown',
        result: null,
        error: 'Unknown tool: relay.missing',
      }),
    );
  });
});

describe('relay confirmation through the shared queue', () => {
  const mutation = (handler = vi.fn(() => ({ changed: true }))) =>
    tool('relay.gated', {
      mutation: true,
      confirmationSummary: () => 'Change it.',
      handler,
    });

  it('runs the handler and returns its result once approved', async () => {
    const handler = vi.fn(() => ({ changed: true }));
    mount([mutation(handler)]);
    const ws = await openedSocket();
    await ws.serverOpen();
    await ws.serverSend({
      type: 'invoke',
      call_id: 'c-ok',
      tool_name: 'relay.gated',
      args: {},
    });
    await vi.waitFor(() =>
      expect(latest.session?.pendingConfirmation?.callId).toBe('c-ok'),
    );
    expect(handler).not.toHaveBeenCalled();
    act(() => latest.session!.approve());
    await vi.waitFor(() =>
      expect(ws.framesOf('result')).toContainEqual({
        type: 'result',
        call_id: 'c-ok',
        result: { changed: true },
      }),
    );
  });

  it('returns a denial error when denied', async () => {
    const handler = vi.fn();
    mount([mutation(handler)]);
    const ws = await openedSocket();
    await ws.serverOpen();
    await ws.serverSend({
      type: 'invoke',
      call_id: 'c-no',
      tool_name: 'relay.gated',
      args: {},
    });
    await vi.waitFor(() => expect(latest.session?.pendingQueueLength).toBe(1));
    act(() => latest.session!.deny());
    await vi.waitFor(() =>
      expect(ws.framesOf('result')).toContainEqual({
        type: 'result',
        call_id: 'c-no',
        result: null,
        error: expect.stringContaining('The user denied this call'),
      }),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('withdraws an open prompt when the back-channel closes', async () => {
    mount([mutation()]);
    const ws = await openedSocket();
    await ws.serverOpen();
    await ws.serverSend({
      type: 'invoke',
      call_id: 'c-gone',
      tool_name: 'relay.gated',
      args: {},
    });
    await vi.waitFor(() => expect(latest.session?.pendingQueueLength).toBe(1));
    await act(async () => ws.close());
    await vi.waitFor(() => expect(latest.session?.pendingQueueLength).toBe(0));
  });
});

describe('advertised tools', () => {
  it('sends title, annotations and output_schema in tools/list', async () => {
    mount([
      tool('relay.read', {
        title: 'Read',
        outputSchema: { type: 'object', properties: {} },
        annotations: { untrustedContentHint: true },
      }),
      tool('relay.write', {
        mutation: true,
        confirmationSummary: () => 'Write.',
      }),
    ]);
    const ws = await openedSocket();
    await ws.serverOpen();
    await vi.waitFor(() =>
      expect(ws.framesOf('tools/list')).not.toHaveLength(0),
    );
    const tools = ws.framesOf('tools/list').at(-1)!['tools'];
    expect(tools).toEqual([
      {
        name: 'relay.read',
        title: 'Read',
        description: 'Test tool relay.read.',
        input_schema: { type: 'object', properties: {} },
        output_schema: { type: 'object', properties: {} },
        annotations: {
          readOnlyHint: true,
          untrustedContentHint: true,
          consequentialHint: false,
        },
      },
      {
        name: 'relay.write',
        description: 'Test tool relay.write.',
        input_schema: { type: 'object', properties: {} },
        annotations: {
          readOnlyHint: false,
          untrustedContentHint: false,
          consequentialHint: true,
        },
        mutation: true,
      },
    ]);
  });
});
