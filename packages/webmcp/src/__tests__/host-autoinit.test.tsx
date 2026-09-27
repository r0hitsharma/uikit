/**
 * A host page that opts in to @mcp-b/global's import-time start owns that
 * instance: the provider neither re-initializes nor tears it down, and says
 * that its transport prop has no effect.
 */
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

Reflect.set(window, '__webModelContextOptions', {
  autoInitialize: true,
  transport: { tabServer: { allowedOrigins: [window.location.origin] } },
});

const { WebMCPProvider } = await import('../provider.js');

it('leaves a host-started polyfill in place and warns about the transport prop', () => {
  const started = (document as unknown as { modelContext?: unknown })
    .modelContext;
  expect(started).toBeDefined();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { unmount } = render(
    <WebMCPProvider
      transport={{ tabServer: { allowedOrigins: ['https://agent.example'] } }}
    >
      {null}
    </WebMCPProvider>,
  );
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('transport prop has no effect'),
  );
  unmount();
  expect((document as unknown as { modelContext?: unknown }).modelContext).toBe(
    started,
  );
  warn.mockRestore();
});
