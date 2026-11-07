import type { Rolldown } from 'vite';

/**
 * Vite 8 bundles with rolldown, and rolldown's chunking option is
 * `build.rolldownOptions.output.codeSplitting`. The Rollup-era spellings
 * linger, and none of them fails in a way that points here:
 *
 * - `manualChunks` as a function still works, with no deprecation warning at
 *   all. It becomes a single group with a dynamic `name`, so it produces
 *   correctly named chunks, but it cannot express `entriesAware`, and that is
 *   the option the design-system group depends on.
 * - `manualChunks` as an object fails the build.
 * - `advancedChunks` still works and logs a deprecation warning.
 * - Once `codeSplitting` is set, rolldown ignores both `manualChunks` and
 *   `advancedChunks` with a warning, so a leftover one next to this preset
 *   builds and does nothing.
 *
 * This preset exists so the groups every code-splitting consumer wants are
 * written once, against the option that is actually read.
 */

/** One chunk group, as rolldown's `codeSplitting.groups` takes it. */
export type CodeSplittingGroup = Rolldown.CodeSplittingGroup;

/** rolldown's `output.codeSplitting` object form. */
export type CodeSplittingOptions = Rolldown.CodeSplittingOptions;

export type CodeSplittingPresetOptions = {
  /**
   * App-specific groups, appended after {@link DEFAULT_GROUPS}. Placement
   * decides only ties: rolldown picks the group with the higher `priority`
   * first, and between equal priorities the one declared earlier, which is
   * always one of the defaults. So a group meant to take modules back from a
   * default needs a priority strictly above it.
   *
   * Otherwise leave `priority` below {@link GROUP_PRIORITY.charting}
   * (rolldown's default of 0 is). A group ranked above a default also takes,
   * through `includeDependenciesRecursively`, every module of that default its
   * own modules import: a drawer-only group ranked above the design system
   * takes the shared button with it and drags itself into the entry load.
   */
  groups?: readonly CodeSplittingGroup[];
};

/**
 * The priorities the default groups claim. Higher wins: a module both groups
 * match goes to the higher one, and since each group also takes the
 * dependencies of what it captures, the ordering is what keeps each group to
 * its own modules.
 *
 * - `react` is highest because React is a peer dependency of both packages,
 *   so either one's dependency walk would otherwise take it.
 * - `designSystem` outranks `charting`, because charting imports the design
 *   system: ranked the other way, charting's walk would pull design-system
 *   modules the entry needs into the charting chunk.
 */
export const GROUP_PRIORITY = {
  react: 30,
  designSystem: 20,
  charting: 10,
} as const;

/**
 * The React runtime. The one test that insists on `node_modules`, because
 * React is never a linked package and the bare word is too common to match on
 * a path segment alone. Anchored on both sides: without the trailing separator
 * `react` also matches `react-table`, and without the leading one it matches
 * `lucide-react` and `@ark-ui/react`, which belong with the design system.
 */
export const REACT_TEST =
  /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/;

/**
 * The design system, matched on its directory name rather than on its scoped
 * package name.
 *
 * Vite resolves with `preserveSymlinks: false`, so a workspace or `npm link`ed
 * package arrives under its real path, something like
 * `packages/design-system/dist/index.js`, with no scope segment in it. A
 * scoped pattern matches an install and silently matches nothing when linked,
 * which is how a consumer developing against this repository runs.
 *
 * The cost is the opposite error: an app's own `src/design-system/` directory
 * is swept into this group too. A consumer can fix that with a group ranked
 * above {@link GROUP_PRIORITY.designSystem}; under-capture could not be fixed
 * by appending anything, which is why this is the error worth having.
 */
export const DESIGN_SYSTEM_TEST = /[\\/]design-system[\\/]/;

/** The charting package, matched on its directory name for the same reason. */
export const CHARTING_TEST = /[\\/]charting[\\/]/;

/**
 * rolldown's default, restated because the two package groups are built on
 * it: neither names a dependency of the package it captures, and both rely on
 * the closure coming along. That is what puts Ark UI, TanStack and lucide with
 * the design system and visx with charting, without this package keeping a
 * copy of either dependency list that would go stale with no build failing.
 */
const INCLUDE_DEPENDENCIES_RECURSIVELY = true;

/**
 * Flat on purpose: every entry needs React, and splitting it per entry set
 * would only fragment what the entry has already loaded.
 */
const REACT_GROUP: CodeSplittingGroup = {
  name: 'react',
  test: REACT_TEST,
  priority: GROUP_PRIORITY.react,
};

/**
 * `entriesAware` is load-bearing here. Without it the whole group becomes one
 * chunk, and since the entry imports some design-system code statically, that
 * one chunk is loaded up front, carrying every component a lazy route uses
 * too. With it, modules are grouped by the set of entries (dynamic imports
 * included) that reach them, so drawer-only code lands in a chunk only the
 * route with the drawer loads.
 *
 * It is also what makes the package's subpath exports pay off: importing
 * `design-system/drawer` keeps the drawer out of the root barrel's graph, and
 * `entriesAware` keeps it out of the entry's chunk. Either alone leaves it
 * there.
 */
const DESIGN_SYSTEM_GROUP: CodeSplittingGroup = {
  name: 'design-system',
  test: DESIGN_SYSTEM_TEST,
  priority: GROUP_PRIORITY.designSystem,
  entriesAware: true,
  includeDependenciesRecursively: INCLUDE_DEPENDENCIES_RECURSIVELY,
};

/**
 * `entriesAware` for the same reason, against the package's `core`,
 * `primitives` and `xychart` subpaths: a route that imports only `primitives`
 * should not download `@visx/xychart` because another route asked for it.
 */
const CHARTING_GROUP: CodeSplittingGroup = {
  name: 'charting',
  test: CHARTING_TEST,
  priority: GROUP_PRIORITY.charting,
  entriesAware: true,
  includeDependenciesRecursively: INCLUDE_DEPENDENCIES_RECURSIVELY,
};

/** The groups this preset ships, highest priority first. */
export const DEFAULT_GROUPS: readonly CodeSplittingGroup[] = [
  REACT_GROUP,
  DESIGN_SYSTEM_GROUP,
  CHARTING_GROUP,
];

/**
 * Chunk groups for Vite 8, as the value of
 * `build.rolldownOptions.output.codeSplitting`:
 *
 * ```ts
 * import codeSplitting from '@r0hitsharma/vite-config/code-splitting';
 *
 * export default defineConfig({
 *   build: {
 *     rolldownOptions: {
 *       output: { codeSplitting: codeSplitting() },
 *     },
 *   },
 * });
 * ```
 *
 * A group that matches nothing emits no chunk, so an app without charts can
 * take the preset whole. The groups are fresh copies on every call, so a
 * consumer may adjust the result without reaching the defaults.
 */
export default function codeSplitting(
  options: CodeSplittingPresetOptions = {},
): CodeSplittingOptions {
  return {
    groups: [...DEFAULT_GROUPS, ...(options.groups ?? [])].map((group) => ({
      ...group,
    })),
  };
}
