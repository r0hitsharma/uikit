#!/usr/bin/env node
// Scope the visual-snapshots job to the stories a pull request can affect.
// ci.yml runs this on pull requests after the build (it reads the build's
// `dist/story-deps.json` and `dist/meta.json`), and snapshot-update.yml runs it
// for its `affected` mode.
//
// Usage (from the repo root):
//   node .github/scripts/scope-snapshots.ts --base <ref> [file ...]
//
// Diffs `<ref>...HEAD` (both sides of renames), maps it with snapshot-scope.ts,
// and, when $GITHUB_ENV is set, exports the result for tests/snapshot.spec.ts:
//   - a scoped run writes SNAPSHOT_STORY_IDS=<ids> (possibly empty: nothing to
//     check);
//   - a full run writes nothing, leaving SNAPSHOT_STORY_IDS unset, which the
//     spec reads as "every story".
// Explicit `file` arguments replace the git diff, for dry runs against the
// current build: `... --base origin/main packages/design-system/README.md`.
//
// Every failure to read an input exits non-zero instead of guessing: a missing
// build artifact means the build is broken, and a scope computed from a partial
// diff is exactly the silent under-check this exists to prevent.

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import {
  isPreviewMeta,
  isStoryDeps,
  parseArtifact,
} from '../../packages/uikit-preview/scripts/story-mapping.ts';
import { lockfileImpact } from './lockfile-affected.ts';
import {
  PREVIEW_PKG_DIR,
  snapshotScope,
  uncoveredPackages,
} from './snapshot-scope.ts';

const TRIGGER_GROUP = 'visual_snapshots';

const repoRoot = process.cwd();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const git = (args: string[]): string => {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    // package-lock.json is over a megabyte, past spawnSync's 1 MB default,
    // and overflowing it truncates stdout while still reporting status 0.
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error !== undefined || result.status !== 0)
    fail(`\`git ${args.join(' ')}\` failed:\n${result.stderr ?? result.error}`);
  return result.stdout;
};

const readRepoFile = (file: string): string =>
  readFileSync(path.join(repoRoot, file), 'utf8');

const { values, positionals } = parseArgs({
  options: { base: { type: 'string' } },
  allowPositionals: true,
});
const base = values.base;
if (!base) fail('--base <ref> is required');

const changed =
  positionals.length > 0
    ? positionals
    : git(['diff', '--name-only', '--no-renames', `${base}...HEAD`])
        .split('\n')
        .filter((line) => line.trim() !== '');

const deps = parseArtifact(
  readRepoFile(`${PREVIEW_PKG_DIR}/dist/story-deps.json`),
  'dist/story-deps.json',
  isStoryDeps,
);
const meta = parseArtifact(
  readRepoFile(`${PREVIEW_PKG_DIR}/dist/meta.json`),
  'dist/meta.json',
  isPreviewMeta,
);

const uncovered = uncoveredPackages(
  readRepoFile('.github/changed-files.yml'),
  TRIGGER_GROUP,
  deps,
);
if (uncovered.length > 0)
  fail(
    `Stories render package(s) that the \`${TRIGGER_GROUP}\` group in\n` +
      '.github/changed-files.yml does not cover, so a pull request changing\n' +
      'only them would never start the visual-snapshots job. Add:\n\n' +
      uncovered.map((dir) => `  - ${dir}/**`).join('\n'),
  );

// Lockfile at the base ref vs HEAD's working copy. `git show` of an absent file
// fails; lockfile-affected reads '' as added-or-removed and answers `all`.
const lockfile = changed.includes('package-lock.json')
  ? lockfileImpact(
      spawnSync('git', ['show', `${base}:package-lock.json`], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }).stdout ?? '',
      readRepoFile('package-lock.json'),
    )
  : undefined;

const scope = snapshotScope({ changed, deps, meta, lockfile });

const summary: string[] = [];
const total = Object.keys(meta.stories).length;
console.log(`${changed.length} changed file(s) vs ${base}.`);
if (scope.kind === 'all') {
  summary.push(`Visual snapshots: **all ${total} stories** (${scope.reason}).`);
  console.log(`Checking ALL ${total} stories: ${scope.reason}.`);
} else {
  summary.push(
    `Visual snapshots: **${scope.ids.length} of ${total} stories** ` +
      `(${scope.fromSources.length} from changed sources, ` +
      `${scope.fromPngs.length} from changed baselines).`,
  );
  console.log(`Checking ${scope.ids.length} of ${total} stories:`);
  for (const id of scope.ids) console.log(`  ${id}`);
  if (scope.unmatched.length > 0) {
    console.log(
      `${scope.unmatched.length} changed file(s) map to no rendered story (skipped):`,
    );
    for (const file of scope.unmatched) console.log(`  ${file}`);
  }
}

const envFile = process.env.GITHUB_ENV;
if (envFile && scope.kind === 'stories')
  appendFileSync(envFile, `SNAPSHOT_STORY_IDS=${scope.ids.join(',')}\n`);

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) appendFileSync(summaryFile, `${summary.join('\n')}\n`);
