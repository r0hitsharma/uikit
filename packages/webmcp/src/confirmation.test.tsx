import { act, cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  flushMicrotasks,
  installFakeContext,
  removeFakeContext,
} from './__tests__/fake-context.js';
import { ConfirmationQueue } from './confirmation.js';
import {
  useRegisterTool,
  useToolConfirmation,
  type ToolConfirmation,
} from './hooks.js';
import { WebMCPProvider } from './provider.js';
import type { ToolSpec } from './types.js';

const latest: { confirmation?: ToolConfirmation } = {};

function ToolMount({ spec }: { spec: ToolSpec }) {
  useRegisterTool(spec);
  return null;
}

function Dialog() {
  const confirmation = useToolConfirmation();
  useEffect(() => {
    latest.confirmation = confirmation;
  });
  return null;
}

function mutation(
  handler: ToolSpec['handler'] = () => ({ changed: true }),
): ToolSpec {
  return {
    name: 'native.mutate',
    description: 'Change something.',
    schema: { type: 'object', properties: {} },
    mutation: true,
    confirmationSummary: () => 'Change something.',
    handler,
  };
}

afterEach(async () => {
  cleanup();
  await flushMicrotasks();
  removeFakeContext();
  latest.confirmation = undefined;
});

describe('mutation confirmation on the document.modelContext path', () => {
  async function setup(handler?: ToolSpec['handler'], windowSeconds = 5) {
    const ctx = installFakeContext();
    render(
      <WebMCPProvider
        initPolyfill={false}
        confirmationWindowSeconds={windowSeconds}
      >
        <ToolMount spec={mutation(handler)} />
        <Dialog />
      </WebMCPProvider>,
    );
    await flushMicrotasks();
    const execute = ctx.tools.get('native.mutate')!.execute;
    return { execute };
  }

  it('holds the call until the user approves, then runs the handler', async () => {
    const handler = vi.fn(() => ({ changed: true }));
    const { execute } = await setup(handler);
    const call = execute({});
    await vi.waitFor(() =>
      expect(latest.confirmation?.pendingConfirmation?.summary).toBe(
        'Change something.',
      ),
    );
    expect(handler).not.toHaveBeenCalled();
    act(() => latest.confirmation!.approve());
    await expect(call).resolves.toEqual({ changed: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns a denial result without running the handler when denied', async () => {
    const handler = vi.fn();
    const { execute } = await setup(handler);
    const call = execute({});
    await vi.waitFor(() =>
      expect(latest.confirmation?.pendingQueueLength).toBe(1),
    );
    act(() => latest.confirmation!.deny());
    await expect(call).resolves.toMatchObject({ denied: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('denies when nobody answers before the window closes', async () => {
    const handler = vi.fn();
    const { execute } = await setup(handler, 0.05);
    await expect(execute({})).resolves.toMatchObject({
      denied: true,
      expired: true,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('withdraws the prompt when the agent aborts the call', async () => {
    const handler = vi.fn();
    const { execute } = await setup(handler);
    const controller = new AbortController();
    const call = execute({}, { signal: controller.signal });
    await vi.waitFor(() =>
      expect(latest.confirmation?.pendingQueueLength).toBe(1),
    );
    controller.abort();
    await expect(call).rejects.toThrow();
    await vi.waitFor(() =>
      expect(latest.confirmation?.pendingQueueLength).toBe(0),
    );
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('ConfirmationQueue', () => {
  const spec = { name: 'q.tool', confirmationSummary: () => 'Do it.' };

  it('answers prompts head first', async () => {
    const queue = new ConfirmationQueue();
    const first = queue.request(spec, {}, { windowSeconds: 5 });
    const second = queue.request(spec, {}, { windowSeconds: 5 });
    expect(queue.getSnapshot()).toHaveLength(2);
    queue.resolveHead('denied');
    queue.resolveHead('approved');
    await expect(first).resolves.toBe('denied');
    await expect(second).resolves.toBe('approved');
    expect(queue.getSnapshot()).toHaveLength(0);
  });

  it('keeps one prompt for a re-delivered call id', async () => {
    const queue = new ConfirmationQueue();
    const original = queue.request(spec, {}, { windowSeconds: 5, callId: 'c' });
    await expect(
      queue.request(spec, {}, { windowSeconds: 5, callId: 'c' }),
    ).resolves.toBe('cancelled');
    expect(queue.getSnapshot()).toHaveLength(1);
    queue.cancelAll();
    await expect(original).resolves.toBe('cancelled');
  });

  it('falls back to the tool name when confirmationSummary throws', () => {
    const queue = new ConfirmationQueue();
    void queue.request(
      {
        name: 'q.throws',
        confirmationSummary: () => {
          throw new Error('bad args');
        },
      },
      {},
      { windowSeconds: 5 },
    );
    expect(queue.getSnapshot()[0]?.summary).toBe('q.throws');
    queue.cancelAll();
  });
});
