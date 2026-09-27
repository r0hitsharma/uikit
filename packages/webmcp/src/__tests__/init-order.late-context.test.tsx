/**
 * Init order when `document.modelContext` does not exist yet at the time the
 * children's registration effects run (the polyfill is only installed by the
 * provider's own effect, e.g. because import-time auto-initialization is off).
 */
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

// No static import of the provider or helpers: importing either evaluates
// @mcp-b/global, whose import-time auto-initialization must be opted out of
// first.

it('a first-mount tool reaches a modelContext installed after it registered', async () => {
  // Opt out of @mcp-b/global's import-time auto-initialization, as a host app
  // can, so the context only appears once the provider's effect runs.
  (window as unknown as Record<string, unknown>)['__webModelContextOptions'] = {
    autoInitialize: false,
  };
  const { WebMCPProvider } = await import('../provider.js');
  const { modelContextToolNames, ReadTool, settle } =
    await import('./helpers.js');
  expect(
    (document as unknown as { modelContext?: unknown }).modelContext,
  ).toBeUndefined();

  render(
    <WebMCPProvider>
      <ReadTool name="init.late" />
    </WebMCPProvider>,
  );
  await settle();
  await vi.waitFor(() =>
    expect(modelContextToolNames()).toContain('init.late'),
  );
});
