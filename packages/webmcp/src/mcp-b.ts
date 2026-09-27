/**
 * The only module that imports @mcp-b/global. The opt-out import must stay
 * first: ES modules evaluate their imports in order, and @mcp-b/global
 * initializes itself on evaluation unless the opt-out has already run.
 */
// oxlint-disable-next-line import/no-unassigned-import -- evaluated for its side effect only, and it must run before @mcp-b/global (see above).
import './mcp-b-optout.js';
import {
  cleanupWebModelContext,
  initializeWebModelContext,
  type TransportConfiguration,
  type WebModelContextInitOptions,
} from '@mcp-b/global';

export { cleanupWebModelContext, initializeWebModelContext };
export type { TransportConfiguration, WebModelContextInitOptions };

/** The host page's `window.__webModelContextOptions`, if any. */
export function hostModelContextOptions():
  | WebModelContextInitOptions
  | undefined {
  if (typeof window === 'undefined') return undefined;
  // oxlint-disable-next-line no-underscore-dangle -- @mcp-b/global's documented configuration hook.
  return window.__webModelContextOptions;
}
