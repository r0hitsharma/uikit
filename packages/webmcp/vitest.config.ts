import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom: the registration tests mount <WebMCPProvider> and install the
    // @mcp-b/global polyfill on `document.modelContext`, which needs a DOM.
    // Each file gets a fresh jsdom, which the init-order tests rely on to
    // start from a first-page-load state.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
