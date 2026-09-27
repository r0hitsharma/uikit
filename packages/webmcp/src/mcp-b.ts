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
} from '@mcp-b/global';

export { cleanupWebModelContext, initializeWebModelContext };
export type { TransportConfiguration };
