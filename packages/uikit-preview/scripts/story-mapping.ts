// Changed file -> affected story ids, shared by the local `snapshot:update`
// (affected-stories.ts) and CI's pull-request scoping
// (.github/scripts/snapshot-scope.ts), so both answer "which snapshots can this
// diff change?" the same way.
//
// Pure: no fs, no git, no process. Callers read the two build artifacts the
// preview build emits and pass them in:
//   - `dist/story-deps.json` (vite.config.ts): post-tree-shake map of every
//     source module -> the story files whose chunk graph includes it.
//   - `dist/meta.json` (Ladle): story id -> story file.
//
// Anything that cannot be confidently attributed (shared config, panda/token
// sources, a changed file inside a consumed package that does not map to a used
// module) resolves to ALL stories: over-rendering is cheap, missing one is not.

/** `dist/story-deps.json`: built module (repo-rel) -> story files using it. */
export type StoryDeps = {
  modules: Record<string, string[]>;
};

/** The slice of Ladle's `dist/meta.json` this module reads. */
export type PreviewMeta = {
  stories: Record<string, { filePath: string }>;
};

export type StoryScope =
  // `file` is the first changed path that forced the full run.
  | { kind: 'all'; file: string }
  // `unmatched`: changed code in a consumed package that no story renders.
  | { kind: 'stories'; ids: string[]; unmatched: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isStoryDeps = (value: unknown): value is StoryDeps =>
  isRecord(value) &&
  isRecord(value.modules) &&
  Object.values(value.modules).every(
    (stories) =>
      Array.isArray(stories) &&
      stories.every((story) => typeof story === 'string'),
  );

export const isPreviewMeta = (value: unknown): value is PreviewMeta =>
  isRecord(value) &&
  isRecord(value.stories) &&
  Object.values(value.stories).every(
    (story) => isRecord(story) && typeof story.filePath === 'string',
  );

/** Parse a build artifact, failing loudly if it is not the shape we expect. */
export const parseArtifact = <T>(
  text: string,
  file: string,
  isValid: (value: unknown) => value is T,
): T => {
  const parsed: unknown = JSON.parse(text);
  if (!isValid(parsed)) throw new Error(`Unexpected shape in ${file}`);
  return parsed;
};

/**
 * Packages that appear in the dependency graph at all. A change to any other
 * package cannot affect a snapshot.
 */
export const graphPackages = (deps: StoryDeps): Set<string> => {
  const packages = new Set<string>();
  for (const moduleId of Object.keys(deps.modules)) {
    const m = moduleId.match(/^packages\/([^/]+)\//);
    if (m?.[1]) packages.add(m[1]);
  }
  return packages;
};

const CODE_EXT = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/;

/**
 * Map repo-relative changed paths to the story ids they can affect.
 *
 * `previewPkgDir` is the preview package's repo-relative directory
 * (`packages/uikit-preview`); Ladle's `filePath`s are relative to it.
 */
export const scopeStories = (
  changed: readonly string[],
  deps: StoryDeps,
  meta: PreviewMeta,
  previewPkgDir: string,
): StoryScope => {
  const previewPkgName = previewPkgDir.slice('packages/'.length);
  const previewPrefix = `${previewPkgDir}/`;

  // story file (repo-rel) -> story ids
  const idsByStoryFile = new Map<string, string[]>();
  for (const [id, story] of Object.entries(meta.stories)) {
    const file = `${previewPrefix}${story.filePath}`;
    const ids = idsByStoryFile.get(file) ?? [];
    ids.push(id);
    idsByStoryFile.set(file, ids);
  }

  const packagesInGraph = graphPackages(deps);
  const affected = new Set<string>();
  const unmatched: string[] = [];

  for (const file of changed) {
    // A changed story file → exactly its stories.
    if (idsByStoryFile.has(file)) {
      for (const id of idsByStoryFile.get(file) ?? []) affected.add(id);
      continue;
    }

    const pkg = file.match(/^packages\/([^/]+)\/(.*)$/);
    if (!pkg) {
      // Repo-root files (.github, docs, tooling) don't affect rendered stories.
      continue;
    }
    const [, pkgName, rest] = pkg;
    // Both groups are non-optional in the pattern above, so a match carries them.
    if (pkgName === undefined || rest === undefined) continue;

    if (pkgName === previewPkgName) {
      // uikit-preview: a non-story source/config change is broad (shared
      // provider, panda config, vite/playwright config, the spec itself,
      // styled-system…).
      if (rest.startsWith('src/stories/')) continue; // deleted/renamed story, no id
      return { kind: 'all', file };
    }

    if (!packagesInGraph.has(pkgName)) continue; // package no story depends on

    // Panda preset inputs (recipes + the preset itself) compile into the
    // globally-generated styled-system CSS, which every story consumes by
    // stable class name, not through the JS module graph. So a change here can
    // restyle any story (e.g. a DataTable recipe tweak repaints the table
    // embedded in the filter-primitives story) while mapping to zero modules in
    // story-deps, which the per-module lookup below would silently skip.
    // Attribute conservatively. The set is `uikit-preview/panda.config.ts`'s
    // own `dependencies` list, not a guess: `src/tokens/` and `src/staticCss.ts`
    // are Panda inputs too. `sharedThemeTokens.ts` is not re-exported from the
    // tokens barrel and `staticCss.ts` is tree-shaken out of every story chunk,
    // so neither appears in story-deps at all; both fell through to
    // `unmatched` and updated ZERO baselines for a change that repaints every
    // story. (`panda.shared.ts` is safe only by accident: it sits at the
    // package root, misses `^src/`, and hits the catch-all at the bottom of the
    // loop.)
    if (/^src\/(recipes\/|tokens\/|panda-preset\.|staticCss\.)/.test(rest))
      return { kind: 'all', file };

    // Consumed package: map a source file to its built module and look it up.
    const srcMatch = rest.match(/^src\/(.+)$/);
    if (srcMatch?.[1] && CODE_EXT.test(rest)) {
      const distRel = srcMatch[1].replace(CODE_EXT, '.js');
      const distId = `packages/${pkgName}/dist/${distRel}`;
      const stories = deps.modules[distId];
      if (stories) {
        for (const s of stories)
          for (const id of idsByStoryFile.get(s) ?? []) affected.add(id);
      } else {
        unmatched.push(file); // built module exists but no story uses it → skip
      }
      continue;
    }

    // Non-code source, package.json, panda-preset, tsconfig… inside a consumed
    // package: could change many built outputs. Be safe.
    return { kind: 'all', file };
  }

  return { kind: 'stories', ids: [...affected].sort(), unmatched };
};
