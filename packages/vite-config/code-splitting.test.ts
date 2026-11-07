import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Rolldown } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import codeSplitting, {
  CHARTING_TEST,
  DEFAULT_GROUPS,
  DESIGN_SYSTEM_TEST,
  GROUP_PRIORITY,
  REACT_TEST,
  type CodeSplittingGroup,
} from './dist/code-splitting.js';

/**
 * Chunking fails quietly. A group rolldown never reads, or one that reads but
 * captures the wrong modules, still produces a build that runs; it just loads
 * more up front than it should. So the claims here are made against the chunk
 * graph of a real `vite build`, and each one is paired with a build that is
 * expected to break it, so that an assertion that could never fail is caught.
 *
 * `dist` is what a consumer resolves through `exports`, so that, not the
 * TypeScript source, is what is exercised here.
 */

const fixtureRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/code-splitting',
);

/** Temporary fixture copies, removed once the suite is done with them. */
const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots)
    fs.rmSync(root, { recursive: true, force: true });
});

type App = { base: string; root: string };

/**
 * The fixture app, with its stub packages installed under `node_modules` the
 * way `npm install` lays them out. `node_modules` cannot be committed, so the
 * tree is assembled per app.
 */
function installedApp(): App {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-config-split-'));
  tempRoots.push(base);
  const root = path.join(base, 'app');
  fs.cpSync(path.join(fixtureRoot, 'app'), root, { recursive: true });
  fs.cpSync(
    path.join(fixtureRoot, 'packages'),
    path.join(root, 'node_modules'),
    { recursive: true },
  );
  return { base, root };
}

/**
 * The same app with the design system and charting linked in from outside
 * `node_modules`, the way a workspace or `npm link` provides them. Vite
 * resolves with `preserveSymlinks: false`, so their module ids become
 * `<base>/packages/<name>/...`, with no scope segment anywhere.
 */
function linkedApp(): App {
  const app = installedApp();
  for (const name of ['design-system', 'charting']) {
    const installed = path.join(app.root, 'node_modules/@r0hitsharma', name);
    const linked = path.join(app.base, 'packages', name);
    fs.mkdirSync(path.dirname(linked), { recursive: true });
    fs.renameSync(installed, linked);
    fs.symlinkSync(linked, installed, 'junction');
  }
  // A linked package resolves its own imports from its real path, outside the
  // app, as a real checkout would from its own `node_modules`.
  fs.symlinkSync(
    path.join(app.root, 'node_modules'),
    path.join(app.base, 'node_modules'),
    'junction',
  );
  return app;
}

let installed: App;

beforeAll(() => {
  installed = installedApp();
});

type Chunk = Rolldown.OutputChunk;

async function buildApp(
  output: Rolldown.OutputOptions,
  app: App = installed,
): Promise<Chunk[]> {
  const result = await build({
    root: app.root,
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      modulePreload: false,
      rolldownOptions: {
        input: path.join(app.root, 'entry.js'),
        output,
      },
    },
  });
  const chunks = (result as Rolldown.RolldownOutput).output.filter(
    (item): item is Chunk => item.type === 'chunk',
  );
  // An entry plus three lazy routes at the very least; fewer means the
  // fixture did not build the graph the assertions below are about.
  expect(chunks.length).toBeGreaterThanOrEqual(4);
  return chunks;
}

/** A build with these groups and nothing else in `codeSplitting`. */
function buildWithGroups(
  groups: readonly CodeSplittingGroup[],
  app: App = installed,
): Promise<Chunk[]> {
  return buildApp({ codeSplitting: { groups: [...groups] } }, app);
}

/** The defaults with one field overridden on every group, or on one by name. */
function defaultsWith(
  patch: Partial<CodeSplittingGroup>,
  only?: string,
): CodeSplittingGroup[] {
  return DEFAULT_GROUPS.map((group) =>
    only === undefined || group.name === only ? { ...group, ...patch } : group,
  );
}

/** The entry chunk and every chunk it pulls in statically: what loads first. */
function initialChunks(chunks: Chunk[]): Chunk[] {
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const entries = chunks.filter(
    (chunk) => chunk.isEntry && !chunk.isDynamicEntry,
  );
  expect(entries).toHaveLength(1);

  const seen = new Set<Chunk>();
  const queue = [...entries];
  while (queue.length > 0) {
    const chunk = queue.pop()!;
    if (seen.has(chunk)) continue;
    seen.add(chunk);
    for (const file of chunk.imports) {
      const imported = byFile.get(file);
      expect(imported, `missing chunk ${file}`).toBeDefined();
      queue.push(imported!);
    }
  }
  return [...seen];
}

/**
 * The one chunk carrying a fixture module's marker string. Exactly one: a
 * marker in no chunk means the module was tree-shaken or never built, and
 * every "not in the initial chunks" claim about it would pass for free.
 */
function chunkWith(chunks: Chunk[], marker: string): Chunk {
  const found = chunks.filter((chunk) => chunk.code.includes(marker));
  expect(found, `${marker} should be in exactly one chunk`).toHaveLength(1);
  return found[0]!;
}

function nameOf(chunks: Chunk[], marker: string): string {
  return chunkWith(chunks, marker).name;
}

function isInitial(chunks: Chunk[], marker: string): boolean {
  return initialChunks(chunks).includes(chunkWith(chunks, marker));
}

function sameChunk(chunks: Chunk[], a: string, b: string): boolean {
  return chunkWith(chunks, a) === chunkWith(chunks, b);
}

const DESIGN_SYSTEM_CHUNK = /^design-system/;
const CHARTING_CHUNK = /^charting/;

describe('code-splitting preset: config', () => {
  it('ships the React, design-system and charting groups, in priority order', () => {
    const { groups } = codeSplitting();

    expect(groups?.map((group) => [group.name, group.priority])).toEqual([
      ['react', GROUP_PRIORITY.react],
      ['design-system', GROUP_PRIORITY.designSystem],
      ['charting', GROUP_PRIORITY.charting],
    ]);
    expect(GROUP_PRIORITY.react).toBeGreaterThan(GROUP_PRIORITY.designSystem);
    expect(GROUP_PRIORITY.designSystem).toBeGreaterThan(
      GROUP_PRIORITY.charting,
    );
  });

  it('sets entriesAware and an explicit dependency walk on the package groups only', () => {
    const { groups } = codeSplitting();

    expect(
      groups?.filter((group) => group.entriesAware).map((group) => group.name),
    ).toEqual(['design-system', 'charting']);
    // Stated rather than inherited, so a change to rolldown's default cannot
    // silently change what the groups capture.
    expect(
      groups
        ?.filter((group) => group.includeDependenciesRecursively === true)
        .map((group) => group.name),
    ).toEqual(['design-system', 'charting']);
  });

  it('anchors the React test so it takes neither react-* nor *-react packages', () => {
    for (const id of [
      '/app/node_modules/react/index.js',
      '/app/node_modules/react-dom/client.js',
      'C:\\app\\node_modules\\scheduler\\index.js',
    ])
      expect(REACT_TEST.test(id), id).toBe(true);

    for (const id of [
      '/app/node_modules/react-table/index.js',
      '/app/node_modules/lucide-react/dist/index.js',
      '/app/node_modules/@ark-ui/react/dist/index.js',
      // Not a dependency at all: an app directory of that name.
      '/app/src/react/index.js',
    ])
      expect(REACT_TEST.test(id), id).toBe(false);
  });

  it('matches the packages by directory name, installed or linked', () => {
    const layouts = (name: string): string[] => [
      `/app/node_modules/@r0hitsharma/${name}/dist/index.js`,
      `C:\\app\\node_modules\\@r0hitsharma\\${name}\\dist\\index.js`,
      // `npm link` or a workspace: the real path, no scope segment.
      `/src/uikit/packages/${name}/dist/index.js`,
    ];
    for (const id of layouts('design-system'))
      expect(DESIGN_SYSTEM_TEST.test(id), id).toBe(true);
    for (const id of layouts('charting'))
      expect(CHARTING_TEST.test(id), id).toBe(true);

    // A package sharing the prefix is a different directory.
    expect(
      DESIGN_SYSTEM_TEST.test(
        '/app/node_modules/@r0hitsharma/design-systemx/a',
      ),
    ).toBe(false);
    expect(CHARTING_TEST.test('/app/node_modules/chartingjs/a.js')).toBe(false);
    // The accepted over-capture, documented in the README with its fix.
    expect(DESIGN_SYSTEM_TEST.test('/app/src/design-system/theme.ts')).toBe(
      true,
    );
  });

  it('appends consumer groups after the defaults', () => {
    const extra: CodeSplittingGroup = { name: 'maps', test: /maplibre/ };
    const { groups } = codeSplitting({ groups: [extra] });

    expect(groups?.map((group) => group.name)).toEqual([
      'react',
      'design-system',
      'charting',
      'maps',
    ]);
    expect(groups?.slice(0, 3)).toEqual([...DEFAULT_GROUPS]);
  });

  it('returns copies, so editing the result leaves the defaults alone', () => {
    const { groups } = codeSplitting();
    groups![1]!.entriesAware = false;

    expect(DEFAULT_GROUPS[1]!.entriesAware).toBe(true);
    expect(codeSplitting().groups![1]!.entriesAware).toBe(true);
  });
});

describe('code-splitting preset: fixture build', () => {
  it('applies the groups: each package lands in its named chunk', async () => {
    const chunks = await buildApp({ codeSplitting: codeSplitting() });

    expect(nameOf(chunks, 'REACT_MARKER')).toBe('react');
    expect(nameOf(chunks, 'DS_BUTTON_MARKER')).toMatch(DESIGN_SYSTEM_CHUNK);
    expect(nameOf(chunks, 'DS_DRAWER_ONLY_MARKER')).toMatch(
      DESIGN_SYSTEM_CHUNK,
    );
    expect(nameOf(chunks, 'XYCHART_MARKER')).toMatch(CHARTING_CHUNK);
    expect(nameOf(chunks, 'PRIMITIVES_MARKER')).toMatch(CHARTING_CHUNK);

    // The baseline: without the groups nothing carries those names, so a
    // group that silently matched nothing fails the lines above.
    const ungrouped = await buildApp({});
    for (const marker of ['REACT_MARKER', 'DS_BUTTON_MARKER', 'XYCHART_MARKER'])
      expect(nameOf(ungrouped, marker)).not.toMatch(
        /^(react|design-system|charting)/,
      );
  });

  it('keeps lazy-only design-system code out of what the entry loads', async () => {
    const chunks = await buildApp({ codeSplitting: codeSplitting() });

    // The positive half first: the shell's own design-system code is in the
    // initial set, so that set is real and the negative claims mean something.
    expect(isInitial(chunks, 'DS_BUTTON_MARKER')).toBe(true);
    expect(isInitial(chunks, 'REACT_MARKER')).toBe(true);

    expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(false);
    expect(isInitial(chunks, 'ARK_MARKER')).toBe(false);
    expect(isInitial(chunks, 'XYCHART_MARKER')).toBe(false);
    expect(isInitial(chunks, 'PRIMITIVES_MARKER')).toBe(false);
    expect(sameChunk(chunks, 'DS_DRAWER_ONLY_MARKER', 'DS_BUTTON_MARKER')).toBe(
      false,
    );
  });

  it('puts drawer-only code in the entry load once entriesAware is dropped', async () => {
    // The control for the case above: the same groups without entriesAware
    // must fail it, or that case is not measuring entriesAware at all.
    const chunks = await buildWithGroups(defaultsWith({ entriesAware: false }));

    expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(true);
    expect(isInitial(chunks, 'ARK_MARKER')).toBe(true);
    expect(sameChunk(chunks, 'DS_DRAWER_ONLY_MARKER', 'DS_BUTTON_MARKER')).toBe(
      true,
    );
  });

  it('splits charting per route, so one subpath does not wait on another', async () => {
    const chunks = await buildApp({ codeSplitting: codeSplitting() });
    expect(sameChunk(chunks, 'PRIMITIVES_MARKER', 'XYCHART_MARKER')).toBe(
      false,
    );
    expect(sameChunk(chunks, 'VISX_SHAPE_MARKER', 'VISX_XYCHART_MARKER')).toBe(
      false,
    );

    // Control: flat, the sparkline route downloads the xychart code too.
    const flat = await buildWithGroups(
      defaultsWith({ entriesAware: false }, 'charting'),
    );
    expect(sameChunk(flat, 'PRIMITIVES_MARKER', 'XYCHART_MARKER')).toBe(true);
    expect(sameChunk(flat, 'VISX_SHAPE_MARKER', 'VISX_XYCHART_MARKER')).toBe(
      true,
    );
  });

  it('takes each package dependency closure with it, without naming one', async () => {
    const chunks = await buildApp({ codeSplitting: codeSplitting() });
    expect(nameOf(chunks, 'ARK_MARKER')).toMatch(DESIGN_SYSTEM_CHUNK);
    expect(nameOf(chunks, 'VISX_XYCHART_MARKER')).toMatch(CHARTING_CHUNK);
    expect(nameOf(chunks, 'VISX_SHAPE_MARKER')).toMatch(CHARTING_CHUNK);

    // Control: without the walk, the dependencies fall out of the groups.
    const unwalked = await buildWithGroups(
      defaultsWith({ includeDependenciesRecursively: false }),
    );
    expect(nameOf(unwalked, 'ARK_MARKER')).not.toMatch(DESIGN_SYSTEM_CHUNK);
    expect(nameOf(unwalked, 'VISX_XYCHART_MARKER')).not.toMatch(CHARTING_CHUNK);
  });

  it('keeps React shared rather than letting a package closure claim it', async () => {
    // React is a peer dependency of both packages, so their walks reach it.
    const withoutReact = await buildWithGroups(
      DEFAULT_GROUPS.filter((group) => group.name !== 'react'),
    );
    expect(nameOf(withoutReact, 'REACT_MARKER')).toMatch(DESIGN_SYSTEM_CHUNK);

    const chunks = await buildApp({ codeSplitting: codeSplitting() });
    expect(nameOf(chunks, 'REACT_MARKER')).toBe('react');
  });

  it('leaves design-system modules charting imports in the design chunk', async () => {
    const chunks = await buildApp({ codeSplitting: codeSplitting() });
    expect(nameOf(chunks, 'DS_BUTTON_MARKER')).toMatch(DESIGN_SYSTEM_CHUNK);
    expect(isInitial(chunks, 'XYCHART_MARKER')).toBe(false);

    // Control: charting ranked above the design system walks the shared
    // button into a charting chunk, which the entry then has to load.
    const inverted = await buildWithGroups(
      defaultsWith({ priority: GROUP_PRIORITY.designSystem + 1 }, 'charting'),
    );
    expect(nameOf(inverted, 'DS_BUTTON_MARKER')).toMatch(CHARTING_CHUNK);
  });

  it('applies an appended consumer group without disturbing the defaults', async () => {
    const geo: CodeSplittingGroup = {
      name: 'geo',
      test: /[\\/]node_modules[\\/]geo-lib[\\/]/,
    };

    // Without the group, geo-lib is not in a chunk of that name, so the
    // name below is the group's doing.
    const before = await buildApp({ codeSplitting: codeSplitting() });
    expect(nameOf(before, 'GEO_LIB_MARKER')).not.toBe('geo');

    const chunks = await buildApp({
      codeSplitting: codeSplitting({ groups: [geo] }),
    });

    expect(nameOf(chunks, 'GEO_LIB_MARKER')).toBe('geo');
    expect(isInitial(chunks, 'GEO_LIB_MARKER')).toBe(false);
    expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(false);
    expect(nameOf(chunks, 'DS_BUTTON_MARKER')).toMatch(DESIGN_SYSTEM_CHUNK);
  });

  it('sweeps an app directory named design-system in, until a higher group takes it back', async () => {
    // The accepted cost of matching on the directory name.
    const chunks = await buildApp({ codeSplitting: codeSplitting() });
    expect(nameOf(chunks, 'APP_THEME_MARKER')).toMatch(DESIGN_SYSTEM_CHUNK);

    const appTheme = (priority: number): CodeSplittingGroup => ({
      name: 'app-theme',
      test: /[\\/]app[\\/]design-system[\\/]/,
      priority,
    });

    // A tie goes to the group declared first, which is the default.
    const tied = await buildApp({
      codeSplitting: codeSplitting({
        groups: [appTheme(GROUP_PRIORITY.designSystem)],
      }),
    });
    expect(nameOf(tied, 'APP_THEME_MARKER')).toMatch(DESIGN_SYSTEM_CHUNK);

    const above = await buildApp({
      codeSplitting: codeSplitting({
        groups: [appTheme(GROUP_PRIORITY.designSystem + 1)],
      }),
    });
    expect(nameOf(above, 'APP_THEME_MARKER')).toBe('app-theme');
    expect(nameOf(above, 'DS_BUTTON_MARKER')).toMatch(DESIGN_SYSTEM_CHUNK);
  });

  it('lets a consumer group that outranks a default take its shared modules, as the README warns', async () => {
    // A group takes the dependencies of what it captures. Ranked above the
    // design-system group, a drawer-only group therefore takes the button the
    // drawer imports, and the entry, which needs that button, now loads the
    // drawer with it.
    const drawer: CodeSplittingGroup = {
      name: 'drawer',
      test: /[\\/]design-system[\\/]drawer\.js$/,
      priority: GROUP_PRIORITY.designSystem + 1,
    };
    const chunks = await buildApp({
      codeSplitting: codeSplitting({ groups: [drawer] }),
    });

    expect(nameOf(chunks, 'DS_BUTTON_MARKER')).toBe('drawer');
    expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(true);
  });
});

describe('code-splitting preset: linked packages', () => {
  it('groups a linked design system and charting package too', async () => {
    const linked = linkedApp();
    const chunks = await buildApp({ codeSplitting: codeSplitting() }, linked);

    // The ids really are the real paths, or this case proves nothing.
    const button = chunkWith(chunks, 'DS_BUTTON_MARKER');
    const buttonId = button.moduleIds.find((id) => id.endsWith('button.js'));
    expect(buttonId?.replaceAll('\\', '/')).toContain(
      '/packages/design-system/',
    );
    expect(buttonId).not.toContain('@r0hitsharma');

    expect(button.name).toMatch(DESIGN_SYSTEM_CHUNK);
    expect(nameOf(chunks, 'XYCHART_MARKER')).toMatch(CHARTING_CHUNK);
    expect(isInitial(chunks, 'DS_BUTTON_MARKER')).toBe(true);
    expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(false);

    // Control: a scope-anchored test matches nothing in this layout.
    const scoped = await buildWithGroups(
      defaultsWith(
        { test: /[\\/]@r0hitsharma[\\/]design-system[\\/]/ },
        'design-system',
      ),
      linked,
    );
    expect(nameOf(scoped, 'DS_BUTTON_MARKER')).not.toMatch(DESIGN_SYSTEM_CHUNK);
  });
});

describe('the Rollup-era options, as the README describes them', () => {
  // rolldown behaviour rather than this preset's, pinned because the README
  // tells consumers to rely on it. If one of these starts failing, the README
  // is wrong, not just this test.
  const designFn = (id: string): string | null =>
    id.includes('design-system') ? 'ds' : null;

  it('still applies manualChunks as a function, with no way to express entriesAware', async () => {
    const chunks = await buildApp({ manualChunks: designFn });

    expect(nameOf(chunks, 'DS_BUTTON_MARKER')).toBe('ds');
    // One flat chunk the entry needs, so the drawer loads with it.
    expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(true);
  });

  it('fails the build on manualChunks as an object', async () => {
    await expect(
      buildApp({
        // @ts-expect-error -- the object form is exactly what is being probed
        manualChunks: { ds: ['@r0hitsharma/design-system'] },
      }),
    ).rejects.toThrow(/manualChunks is not a function/);
  });

  it('still applies advancedChunks', async () => {
    const chunks = await buildApp({
      advancedChunks: { groups: [{ name: 'ds', test: /design-system/ }] },
    });
    expect(nameOf(chunks, 'DS_BUTTON_MARKER')).toBe('ds');
  });

  it('ignores every one of them once codeSplitting is set', async () => {
    const leftovers: Rolldown.OutputOptions[] = [
      { manualChunks: designFn },
      // @ts-expect-error -- the object form is exactly what is being probed
      { manualChunks: { ds: ['@r0hitsharma/design-system'] } },
      { advancedChunks: { groups: [{ name: 'ds', test: /design-system/ }] } },
    ];
    for (const leftover of leftovers) {
      const chunks = await buildApp({
        ...leftover,
        codeSplitting: codeSplitting(),
      });
      expect(chunks.some((chunk) => chunk.name === 'ds')).toBe(false);
      expect(nameOf(chunks, 'DS_BUTTON_MARKER')).toMatch(DESIGN_SYSTEM_CHUNK);
      expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(false);
    }
  });
});
