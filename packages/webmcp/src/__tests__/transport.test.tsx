/**
 * The MCP-B transport is explicit and same-origin by default, and importing
 * the package does not start @mcp-b/global's wildcard-origin auto-init.
 */
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const init = vi.hoisted(() => vi.fn());

vi.mock('@mcp-b/global', async (importOriginal) => {
  const real = await importOriginal<typeof import('@mcp-b/global')>();
  return {
    ...real,
    initializeWebModelContext: (
      ...args: Parameters<typeof real.initializeWebModelContext>
    ) => {
      init(...args);
      real.initializeWebModelContext(...args);
    },
  };
});

const { WebMCPProvider } = await import('../provider.js');

afterEach(() => {
  init.mockClear();
});

describe('WebMCPProvider transport', () => {
  it('importing the package does not initialize the polyfill', () => {
    expect(
      (document as unknown as { modelContext?: unknown }).modelContext,
    ).toBeUndefined();
    expect(init).not.toHaveBeenCalled();
  });

  it('defaults to a same-origin tab transport and no iframe transport', () => {
    const { unmount } = render(<WebMCPProvider>{null}</WebMCPProvider>);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({
      transport: {
        tabServer: { allowedOrigins: [window.location.origin] },
        iframeServer: false,
      },
    });
    expect(
      (document as unknown as { modelContext?: unknown }).modelContext,
    ).toBeDefined();
    unmount();
  });

  it('passes a configured transport through, without re-initializing for an equal inline object', () => {
    const transport = () => ({
      tabServer: { allowedOrigins: ['https://agent.example'] },
      iframeServer: { allowedOrigins: ['https://embedder.example'] },
    });
    const { rerender, unmount } = render(
      <WebMCPProvider transport={transport()}>{null}</WebMCPProvider>,
    );
    rerender(<WebMCPProvider transport={transport()}>{null}</WebMCPProvider>);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({ transport: transport() });
    unmount();
  });
});
