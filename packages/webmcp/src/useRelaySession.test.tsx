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

function Session() {
  const result = useRelaySession({
    relayBaseUrl: 'https://relay.test',
    storageKey: 'relay-test',
    confirmationWindowSeconds: 1,
  });
  useEffect(() => {
    latest.session = result;
  });
  return null;
}

function mount(tools: ToolSpec[]) {
  return render(
    <WebMCPProvider initPolyfill={false}>
      {tools.map((spec) => (
        <ToolMount key={spec.name} spec={spec} />
      ))}
      <Session />
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
