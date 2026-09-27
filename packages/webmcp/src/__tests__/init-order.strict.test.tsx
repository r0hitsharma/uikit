/**
 * Init order under StrictMode on a fresh page: the provider initializes (and,
 * in StrictMode, tears down and re-initializes) the polyfill in an effect that
 * runs AFTER its children's registration effects. A tool registered on first
 * mount must still be on the final `document.modelContext`.
 */
import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';

import { WebMCPProvider } from '../provider.js';
import { modelContextToolNames, ReadTool, settle } from './helpers.js';

it('a first-mount tool survives the StrictMode provider re-init', async () => {
  render(
    <StrictMode>
      <WebMCPProvider>
        <ReadTool name="init.strict" />
      </WebMCPProvider>
    </StrictMode>,
  );
  await settle();
  await vi.waitFor(() =>
    expect(modelContextToolNames()).toContain('init.strict'),
  );
});
