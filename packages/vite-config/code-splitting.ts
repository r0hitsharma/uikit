import type { Rolldown } from 'vite';

/**
 * Vite 8 bundles with rolldown, and rolldown's chunking option is
 * `build.rolldownOptions.output.codeSplitting`. The Rollup-era options linger:
 * `manualChunks` survives only in function form, as a deprecated shim that
 * rolldown rewrites into a single `codeSplitting` group, and `advancedChunks`
 * is deprecated too. Once `codeSplitting` is set, rolldown ignores both, with
 * nothing more than a warning, so a leftover `manualChunks` next to this
 * preset still type-checks and builds, and does nothing. This preset exists so
 * the groups every code-splitting consumer wants are written once, against
 * the option that is actually read.
 */

/** One chunk group, as rolldown's `codeSplitting.groups` takes it. */
export type CodeSplittingGroup = Rolldown.CodeSplittingGroup;

/** rolldown's `output.codeSplitting` object form. */
export type CodeSplittingOptions = Rolldown.CodeSplittingOptions;

export type CodeSplittingPresetOptions = {
  /**
   * App-specific groups, appended after {@link DEFAULT_GROUPS}. Placement
   * decides only ties: rolldown picks the group with the higher `priority`
   * first, and between equal priorities the one declared earlier.
   *
   * Leave `priority` below {@link GROUP_PRIORITY.charting} (rolldown's default
   * of 0 is) unless the intent is to take modules away from a default group.
   * A group ranked above one of them also takes, through rolldown's default
   * `includeDependenciesRecursively`, every module of that group its own
   * modules import, so a drawer-only group ranked above the design system
   * takes the shared button with it and drags itself into the entry load.
   */
  groups?: readonly CodeSplittingGroup[];
};

/**
 * The npm scope the design-system and charting packages publish under. Every
 * package in this repository ships from one scope in lockstep, so this is the
 * same scope this package was installed from.
 */
export const PACKAGE_SCOPE = '@r0hitsharma';

/**
 * The priorities the default groups claim. Higher wins: a module both groups
 * match goes to the higher one, and with `includeDependenciesRecursively` on
 * (rolldown's default) a group also takes the dependencies of what it
 * captures, so the ordering is what keeps each group to its own modules.
 *
 * - `react` is highest so that no other group's dependency walk drags React
 *   into it.
 * - `designSystem` outranks `charting`, because charting imports the design
 *   system: ranked the other way, charting's walk would pull design-system
 *   modules into the charting chunk.
 */
export const GROUP_PRIORITY = {
  react: 30,
  designSystem: 20,
  charting: 10,
} as const;

/** A package directory under `node_modules`, on either path separator. */
function packageDir(name: string): RegExp {
  const escaped = name.replaceAll(/[/\\]/g, '[\\\\/]');
  return new RegExp(`[\\\\/]node_modules[\\\\/]${escaped}[\\\\/]`);
}

const REACT_GROUP: CodeSplittingGroup = {
  name: 'react',
  test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
  priority: GROUP_PRIORITY.react,
};

/**
 * `entriesAware` is load-bearing here. Without it the whole group becomes one
 * chunk, and since the entry imports some design-system code statically, that
 * one chunk is loaded up front, carrying every component a lazy route uses
 * too. With it, modules are grouped by the set of entries (dynamic imports
 * included) that reach them, so drawer-only code lands in a chunk only the
 * route with the drawer loads.
 */
const DESIGN_SYSTEM_GROUP: CodeSplittingGroup = {
  name: 'design-system',
  test: packageDir(`${PACKAGE_SCOPE}/design-system`),
  priority: GROUP_PRIORITY.designSystem,
  entriesAware: true,
};

const CHARTING_GROUP: CodeSplittingGroup = {
  name: 'charting',
  test: packageDir(`${PACKAGE_SCOPE}/charting`),
  priority: GROUP_PRIORITY.charting,
};

/**
 * The groups this preset ships: React, the design system and charting. Each
 * matches on a `node_modules` path segment, so a package resolved from
 * anywhere else (an `npm link`ed checkout, which rolldown resolves to its real
 * path) falls through to rolldown's automatic chunking instead.
 */
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
 * The groups are fresh copies on every call, so a consumer may adjust the
 * result without reaching the defaults.
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
