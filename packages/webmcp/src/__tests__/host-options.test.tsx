/**
 * Host-page `__webModelContextOptions` that do not opt in to auto-init must not
 * bring back @mcp-b/global's wildcard-origin import-time start, and the
 * provider still honours the host's other options.
 */
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

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

// Set before the package (and so @mcp-b/global) is evaluated.
Reflect.set(window, '__webModelContextOptions', { installTestingShim: false });

const { WebMCPProvider } = await import('../provider.js');

it('does not auto-initialize for host options without autoInitialize', () => {
  expect(
    (document as unknown as { modelContext?: unknown }).modelContext,
  ).toBeUndefined();
  expect(init).not.toHaveBeenCalled();
});

it('initializes with the host options and the same-origin default', () => {
  const { unmount } = render(<WebMCPProvider>{null}</WebMCPProvider>);
  expect(init).toHaveBeenCalledWith({
    installTestingShim: false,
    transport: {
      tabServer: { allowedOrigins: [window.location.origin] },
      iframeServer: false,
    },
  });
  unmount();
});
