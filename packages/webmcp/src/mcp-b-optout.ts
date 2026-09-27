/**
 * Side-effect module: opt out of @mcp-b/global's import-time initialization.
 *
 * Evaluating @mcp-b/global installs the polyfill and connects a transport
 * straight away, and with no transport configured that transport accepts every
 * origin (`allowedOrigins: ['*']`). WebMCPProvider initializes it itself, with
 * an explicit transport, so this must be evaluated before @mcp-b/global: import
 * it first, as a bare side-effect import, from the one module that imports
 * @mcp-b/global (mcp-b.ts).
 *
 * A host page's own `__webModelContextOptions` are kept (the provider reads
 * them), but only an explicit `autoInitialize: true` keeps the import-time
 * start: options that merely omit it would otherwise start MCP-B with the
 * wildcard default before the provider could configure it.
 */
if (typeof window !== 'undefined') {
  const target = window as unknown as {
    __webModelContextOptions?: { autoInitialize?: boolean };
  };
  // oxlint-disable-next-line no-underscore-dangle -- the global's name is @mcp-b/global's documented configuration hook, not ours to rename.
  const options = (target.__webModelContextOptions ??= {});
  if (options.autoInitialize !== true) options.autoInitialize = false;
}

export {};
