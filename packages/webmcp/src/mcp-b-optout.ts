/**
 * Side-effect module: opt out of @mcp-b/global's import-time initialization.
 *
 * Evaluating @mcp-b/global installs the polyfill and connects a transport
 * straight away, and with no options that transport accepts every origin
 * (`allowedOrigins: ['*']`). WebMCPProvider initializes it itself, with an
 * explicit transport, so this must be evaluated before @mcp-b/global: import it
 * first, as a bare side-effect import, from the one module that imports
 * @mcp-b/global (mcp-b.ts). A host page that already set its own
 * `__webModelContextOptions` keeps them.
 */
if (typeof window !== 'undefined') {
  const target = window as unknown as {
    __webModelContextOptions?: { autoInitialize?: boolean };
  };
  // oxlint-disable-next-line no-underscore-dangle -- the global's name is @mcp-b/global's documented configuration hook, not ours to rename.
  target.__webModelContextOptions ??= { autoInitialize: false };
}

export {};
