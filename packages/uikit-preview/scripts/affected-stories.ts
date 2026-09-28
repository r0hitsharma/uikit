#!/usr/bin/env node
// Default `snapshot:update`: re-render only the visual snapshots a local change
// actually affects, instead of the whole suite. Use `snapshot:update:all` to
// force a full re-render.
//
// How it works:
//   1. Build every workspace package once, preview last. Stories bundle each
//      dependency's `dist/`, never its `src/`, so the dependency builds are what
//      make the render reflect the edit under test rather than the previous one
//      (see `runBuild`; `check-stale-deps.ts` enforces it). The
//      `story-deps.json` Vite plugin (vite.config.ts) then emits a
//      post-tree-shake map of every source module -> the story files whose
//      chunk graph includes it. Tree-shaking is what gives per-component
//      granularity through the shared design-system barrel.
//   2. Diff the working tree (+ branch vs base) and map each changed file to the
//      stories that depend on it (story-mapping.ts, the same mapping CI uses to
//      scope pull requests).
//   3. Run `playwright test --update-snapshots` scoped to those stories via
//      SNAPSHOT_STORY_IDS (see tests/snapshot.spec.ts).
//
// Anything we cannot confidently attribute (shared config, panda/token sources,
// a changed file inside a consumed package we can't map to a used module) falls
// back to updating ALL snapshots — over-updating is cheap, missing one is not.
//
// Base ref for the branch diff is $SNAPSHOT_BASE (default: origin/main, else main).

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

import {
  isPreviewMeta,
  isStoryDeps,
  parseArtifact,
  scopeStories,
} from './story-mapping.ts';

const packageDir = process.cwd();
const repoRoot = path.resolve(packageDir, '..', '..');
const PREVIEW_PKG_DIR = path
  .relative(repoRoot, packageDir)
  .split(path.sep)
  .join('/'); // packages/uikit-preview

const git = (args: string[]): string | null => {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
};

const resolveBase = (): string | null => {
  if (process.env.SNAPSHOT_BASE) return process.env.SNAPSHOT_BASE;
  for (const ref of ['origin/main', 'main']) {
    if (git(['rev-parse', '--verify', '--quiet', ref]) !== null) return ref;
  }
  return null;
};

const changedFiles = (): string[] => {
  const files = new Set<string>();
  const add = (out: string | null) => {
    if (out)
      for (const line of out.split('\n'))
        if (line.trim()) files.add(line.trim());
  };
  const base = resolveBase();
  if (base) add(git(['diff', '--name-only', `${base}...HEAD`]));
  add(git(['diff', '--name-only', 'HEAD'])); // unstaged
  add(git(['diff', '--name-only', '--cached'])); // staged
  add(git(['ls-files', '--others', '--exclude-standard'])); // untracked
  return [...files];
};

const PORT = 61000;
const HOST = '127.0.0.1';

/**
 * Build every workspace package, not just this one.
 *
 * The preview imports `@r0hitsharma/*` through each package's `exports`,
 * which resolve to `dist/` — Ladle bundles that compiled output and never sees
 * the package's `src/`. Building only this package therefore re-rendered the
 * PREVIOUS build of every dependency, which matched the PREVIOUS baseline: the
 * run passed and rewrote nothing while the change was real.
 *
 * Root `npm run build` is `--workspaces --if-present` in the dependency order
 * the root `workspaces` array encodes — the same command CI's visual-snapshots
 * job runs before it renders. It includes this package's own build, so the
 * whole update still does exactly one build of each package; warm, the extra
 * dependency compilation costs a few seconds.
 */
const runBuild = () => {
  console.log('› building all workspace packages (dependencies + preview)…');
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
};

/**
 * Prove the build above actually refreshed every package the stories render,
 * so this script cannot silently regress to validating a stale bundle.
 */
const checkDepsAreFresh = () => {
  const check = spawnSync('node', ['scripts/check-stale-deps.ts'], {
    cwd: packageDir,
    stdio: 'inherit',
  });
  if (check.status !== 0) process.exit(check.status ?? 1);
};

/** Is something already listening? A free port is required, never reused. */
const portInUse = (port: number, host: string) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(port, host);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });

/**
 * Nothing else may hold the port. `ladle preview` would fail to bind, and
 * because playwright.config's `reuseExistingServer` is on off-CI, Playwright
 * would then scrape whatever *is* listening — a leftover server, or another
 * worktree's `snapshot:serve` — comparing this branch's baselines against a
 * different checkout's pixels. Fail rather than render the wrong tree.
 *
 * Checked before `runBuild`, not at render time: it is a hard precondition
 * that costs one `connect()`, and behind the build the same failure arrived
 * only after a full 15-package compile had already been spent on it.
 */
const ensurePortIsFree = async () => {
  if (!(await portInUse(PORT, HOST))) return;
  console.error(
    `Something is already listening on ${HOST}:${PORT}, which is where the\n` +
      'preview under test has to be served from. Stop it and re-run:\n\n' +
      `  lsof -nP -iTCP:${PORT} -sTCP:LISTEN\n`,
  );
  process.exit(1);
};

/**
 * Poll until the server binds, or `signal` aborts, or the deadline passes.
 *
 * The `signal` is not optional politeness: this races against the child's own
 * exit, and losing a `Promise.race` does not stop the loser. Without it, a
 * server that died at t=2s printed its error immediately and then held the
 * event loop open with a ref'd 300ms timer until the full timeout — the
 * caller saw the failure at once and then watched an idle process for another
 * three minutes before it exited.
 */
const waitForPort = (
  port: number,
  host: string,
  timeoutMs: number,
  signal: AbortSignal,
) =>
  new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let timer: NodeJS.Timeout | undefined;
    let socket: net.Socket | undefined;

    const stop = () => {
      clearTimeout(timer);
      socket?.destroy();
    };
    signal.addEventListener(
      'abort',
      () => {
        stop();
        reject(new Error('aborted'));
      },
      { once: true },
    );

    const attempt = () => {
      if (signal.aborted) return;
      socket = net.connect(port, host);
      socket.once('connect', () => {
        stop();
        resolve();
      });
      socket.once('error', () => {
        socket?.destroy();
        if (signal.aborted) return;
        if (Date.now() > deadline)
          reject(new Error(`preview server never came up on ${host}:${port}`));
        else timer = setTimeout(attempt, 300);
      });
    };
    attempt();
  });

/**
 * Serve the already-built preview and run Playwright against it. Because
 * playwright.config's webServer uses `reuseExistingServer` off-CI, the server
 * started here means Playwright skips its own build-and-serve — so the whole
 * update does exactly one build of each package (the one above).
 */
const runPlaywright = async (storyIds: string[] | null) => {
  const env = { ...process.env };
  if (storyIds) {
    env.SNAPSHOT_STORY_IDS = storyIds.join(',');
    console.log(
      `› updating ${storyIds.length} affected snapshot(s):\n  ${storyIds.join('\n  ')}`,
    );
  } else {
    delete env.SNAPSHOT_STORY_IDS;
    console.log(
      '› updating ALL snapshots (change is broad or could not be scoped).',
    );
  }

  const server = spawn('npm', ['run', 'snapshot:serve'], {
    cwd: packageDir,
    detached: true,
    // Capture BOTH streams: Vite (and so `ladle preview`) routes most of its
    // diagnostics — the "port is already in use" line, build-load failures —
    // through its own logger on stdout, so stderr alone reported a bare exit
    // code with an empty tail on exactly the failures this is here to explain.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  for (const stream of [server.stdout, server.stderr]) {
    stream?.on('data', (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    // `killServer` signals the process GROUP. If teardown misses a grandchild
    // that inherited the pipe (npm exiting first and leaving ladle/vite
    // reparented is the ordinary case on SIGTERM), a ref'd read handle would
    // hold this process open after Playwright is done. Unref keeps the
    // diagnostic without letting it pin us. Child stdio pipes are Sockets at
    // runtime but typed as bare Readable, hence the capability check.
    if (stream && 'unref' in stream && typeof stream.unref === 'function')
      stream.unref();
  }
  const killServer = () => {
    try {
      if (server.pid) process.kill(-server.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  };
  process.on('exit', killServer);
  process.on('SIGINT', () => {
    killServer();
    process.exit(130);
  });

  // Cancels the poll below the moment the race is decided, whichever way.
  const settled = new AbortController();
  try {
    // A server that dies (bad build, bind failure) would otherwise leave
    // waitForPort spinning for its full timeout; surface its output instead.
    await Promise.race([
      waitForPort(PORT, HOST, 180_000, settled.signal),
      new Promise<never>((_, reject) => {
        server.once('exit', (code) => {
          // Let the pipes deliver whatever is still buffered before reading
          // them, but never wait on them: with a detached group a surviving
          // grandchild can hold the write end open indefinitely, and 'close'
          // would then never fire at all.
          setTimeout(() => {
            reject(
              new Error(
                `preview server exited (code ${code}) before serving ${HOST}:${PORT}\n${serverOutput}`,
              ),
            );
          }, 100).unref();
        });
      }),
    ]);
    const result = spawnSync(
      'npx',
      ['playwright', 'test', '--update-snapshots'],
      {
        cwd: packageDir,
        stdio: 'inherit',
        env,
      },
    );
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    settled.abort();
    killServer();
  }
};

/** Read a build artifact, failing loudly if it is not the shape we expect. */
const readArtifact = <T>(
  file: string,
  isValid: (value: unknown) => value is T,
): T => parseArtifact(readFileSync(file, 'utf8'), file, isValid);

// --- main -----------------------------------------------------------------

const changed = changedFiles();
if (changed.length === 0) {
  console.log('No changed files detected — nothing to update.');
  process.exit(0);
}

await ensurePortIsFree();
runBuild();
checkDepsAreFresh();

const depsPath = path.join(packageDir, 'dist', 'story-deps.json');
const metaPath = path.join(packageDir, 'dist', 'meta.json');
if (!existsSync(depsPath) || !existsSync(metaPath)) {
  console.error(
    'Missing dist/story-deps.json or dist/meta.json after build; updating all.',
  );
  await runPlaywright(null);
  process.exit(process.exitCode ?? 0);
}

const deps = readArtifact(depsPath, isStoryDeps);
const meta = readArtifact(metaPath, isPreviewMeta);

// The file -> story mapping lives in story-mapping.ts, shared with CI's
// pull-request scoping (.github/scripts/snapshot-scope.ts).
const scope = scopeStories(changed, deps, meta, PREVIEW_PKG_DIR);

if (scope.kind === 'stories' && scope.unmatched.length > 0) {
  console.log(
    `› ${scope.unmatched.length} changed file(s) map to no rendered story (skipped):`,
  );
  for (const f of scope.unmatched) console.log(`  ${f}`);
}

if (scope.kind === 'all') {
  await runPlaywright(null);
} else if (scope.ids.length === 0) {
  console.log('No changed files affect any snapshot — nothing to update.');
  process.exit(0);
} else {
  await runPlaywright(scope.ids);
}
