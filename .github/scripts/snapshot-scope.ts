// Decide which visual snapshots a pull request has to re-check.
//
// The file -> story mapping itself is the preview package's own
// (`packages/uikit-preview/scripts/story-mapping.ts`, also behind the local
// `snapshot:update`); this module wraps it with the parts only a PR diff needs:
//
//   - Changed baseline PNGs name their story directly
//     (`<story-id>-chromium-darwin.png`), and are always re-checked. Handed to
//     the shared mapping instead, a PNG is an unknown uikit-preview file and
//     would force the full suite.
//   - `package-lock.json` is attributed per workspace (`lockfile-affected.ts`).
//     A dependency change reaching any package the stories render (the preview
//     itself included: Playwright, Ladle, Panda, React) can repaint anything,
//     so it forces the full suite; a bump confined to packages no story renders
//     checks nothing. The shared mapping ignores repo-root files entirely.
//   - Docs and unit tests cannot change a pixel (the same exclusions as
//     `check-stale-deps.ts`), so they are dropped before mapping. Otherwise a
//     package README or `panda-preset.test.ts` would force the full suite.
//   - `packages/uikit-preview/demo-relay/` is the demo's Cloudflare Worker, not
//     part of the Ladle bundle, and is dropped too while no story's bundle
//     includes a module from it (the shared mapping would treat it as preview
//     config and force the full suite).
//
// Pure: no fs, no git, no process. The CLI (`scope-snapshots.ts`) reads the
// diff and the build artifacts and passes them in.

import {
  graphPackages,
  scopeStories,
  type PreviewMeta,
  type StoryDeps,
} from '../../packages/uikit-preview/scripts/story-mapping.ts';
import type { LockfileImpact } from './lockfile-affected.ts';

export const PREVIEW_PKG_DIR = 'packages/uikit-preview';
export const SNAPSHOT_DIR = `${PREVIEW_PKG_DIR}/tests/snapshot.spec.ts-snapshots`;
const SNAPSHOT_SUFFIX = '-chromium-darwin.png';

/** Never rendered into a story: see check-stale-deps.ts's NOT_INPUT_FILES. */
const NOT_RENDERED = /(\.test\.[cm]?[jt]sx?|\.md)$/;
const DEMO_RELAY_DIR = `${PREVIEW_PKG_DIR}/demo-relay/`;

export type SnapshotScope =
  | { kind: 'all'; reason: string }
  | {
      kind: 'stories';
      /** Union of `fromPngs` and `fromSources`, sorted. */
      ids: string[];
      fromPngs: string[];
      fromSources: string[];
      /** Changed code in a rendered package that no story's bundle includes. */
      unmatched: string[];
    };

export type SnapshotScopeInput = {
  /** Repo-relative paths changed between the base and HEAD, both sides of renames. */
  changed: readonly string[];
  deps: StoryDeps;
  meta: PreviewMeta;
  /** Required when `changed` includes `package-lock.json`. */
  lockfile?: LockfileImpact;
};

/** Workspace directories whose build output the stories render. */
export const renderedPackageDirs = (deps: StoryDeps): string[] =>
  [
    ...new Set([
      ...graphPackages(deps),
      PREVIEW_PKG_DIR.slice('packages/'.length),
    ]),
  ]
    .map((name) => `packages/${name}`)
    .sort();

export const snapshotScope = ({
  changed,
  deps,
  meta,
  lockfile,
}: SnapshotScopeInput): SnapshotScope => {
  const fromPngs = new Set<string>();
  const sources: string[] = [];
  const relayIsRendered = Object.keys(deps.modules).some((id) =>
    id.startsWith(DEMO_RELAY_DIR),
  );

  for (const file of changed) {
    if (file.startsWith(`${SNAPSHOT_DIR}/`) && file.endsWith(SNAPSHOT_SUFFIX)) {
      fromPngs.add(
        file.slice(SNAPSHOT_DIR.length + 1, -SNAPSHOT_SUFFIX.length),
      );
      continue;
    }

    if (file === 'package-lock.json') {
      if (lockfile === undefined)
        throw new Error(
          'package-lock.json changed but no lockfile impact was given',
        );
      if (lockfile.kind === 'all')
        return { kind: 'all', reason: `package-lock.json: ${lockfile.reason}` };
      const rendered = new Set(renderedPackageDirs(deps));
      const hit = lockfile.dirs.filter((dir) => rendered.has(dir)).sort();
      if (hit.length > 0)
        return {
          kind: 'all',
          reason: `package-lock.json changes dependencies of rendered package(s): ${hit.join(', ')}`,
        };
      continue;
    }

    if (NOT_RENDERED.test(file)) continue;
    if (!relayIsRendered && file.startsWith(DEMO_RELAY_DIR)) continue;
    sources.push(file);
  }

  const mapped = scopeStories(sources, deps, meta, PREVIEW_PKG_DIR);
  if (mapped.kind === 'all')
    return {
      kind: 'all',
      reason: `\`${mapped.file}\` cannot be attributed to specific stories`,
    };

  // A PNG whose story no longer exists (deleted with its story) is not in
  // `meta`; the orphan check owns that case, and an unknown id selects nothing.
  const known = (id: string) => Object.hasOwn(meta.stories, id);
  const pngIds = [...fromPngs].filter(known).sort();
  return {
    kind: 'stories',
    ids: [...new Set([...pngIds, ...mapped.ids])].sort(),
    fromPngs: pngIds,
    fromSources: mapped.ids,
    unmatched: mapped.unmatched,
  };
};

/**
 * Rendered packages the `group` in `.github/changed-files.yml` does not cover
 * with a `packages/<name>/**` pattern.
 *
 * The visual-snapshots job only starts when that group matched, so a package
 * the stories newly render but the group omits would never be re-checked on a
 * pull request, however well this module maps it. Checked on every run of the
 * job, it turns that drift into a failure instead of a silent skip.
 */
export const uncoveredPackages = (
  changedFilesYaml: string,
  group: string,
  deps: StoryDeps,
): string[] => {
  const lines = changedFilesYaml.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === `${group}:`);
  if (start === -1)
    throw new Error(`No \`${group}:\` group in changed-files.yml`);

  const patterns = new Set<string>();
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) continue;
    if (/^\S/.test(line)) break; // the next top-level key ends this group
    const item = line.match(/^\s+-\s+['"]?([^'"\s#]+)/);
    if (item?.[1]) patterns.add(item[1]);
  }

  return renderedPackageDirs(deps).filter((dir) => !patterns.has(`${dir}/**`));
};
