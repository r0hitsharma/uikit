/**
 * In an insecure context neither WebMCP nor the MCP-B polyfill installs
 * `document.modelContext`; the provider says so instead of failing silently.
 */
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { WebMCPProvider } from '../provider.js';
import { ReadTool } from './helpers.js';

it('warns once that tools are not exposed outside a secure context', () => {
  vi.stubGlobal('isSecureContext', false);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { rerender, unmount } = render(
    <WebMCPProvider>
      <ReadTool name="insecure.read" />
    </WebMCPProvider>,
  );
  rerender(
    <WebMCPProvider transport={{ tabServer: false }}>
      <ReadTool name="insecure.read" />
    </WebMCPProvider>,
  );
  expect(
    (document as unknown as { modelContext?: unknown }).modelContext,
  ).toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('secure context'));
  unmount();
  vi.unstubAllGlobals();
});
