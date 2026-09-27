import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Rolldown } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import codeSplitting, {
  DEFAULT_GROUPS,
  GROUP_PRIORITY,
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

/**
 * The fixture app, with its stub packages installed under `node_modules`. The
 * groups match on that path segment, and `node_modules` cannot be committed,
 * so the tree is assembled per run.
 */
let appRoot = '';

beforeAll(() => {
  appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-config-split-'));
  fs.cpSync(path.join(fixtureRoot, 'app'), appRoot, { recursive: true });
  fs.cpSync(
    path.join(fixtureRoot, 'packages'),
    path.join(appRoot, 'node_modules'),
    { recursive: true },
  );
});

afterAll(() => {
  if (appRoot) fs.rmSync(appRoot, { recursive: true, force: true });
});

type Chunk = Rolldown.OutputChunk;

async function buildFixture(output: Rolldown.OutputOptions): Promise<Chunk[]> {
  const result = await build({
    root: appRoot,
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      modulePreload: false,
      rolldownOptions: {
        input: path.join(appRoot, 'entry.js'),
        output,
      },
    },
  });
  const chunks = (result as Rolldown.RolldownOutput).output.filter(
    (item): item is Chunk => item.type === 'chunk',
  );
  // An entry plus two lazy routes at the very least; fewer means the fixture
  // did not build the graph the assertions below are about.
  expect(chunks.length).toBeGreaterThanOrEqual(3);
  return chunks;
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

function isInitial(chunks: Chunk[], marker: string): boolean {
  return initialChunks(chunks).includes(chunkWith(chunks, marker));
}

describe('code-splitting preset: config', () => {
  it('ships the React, design-system and charting groups, in priority order', () => {
    const { groups } = codeSplitting();

    expect(groups?.map((group) => [group.name, group.priority])).toEqual([
      ['react', GROUP_PRIORITY.react],
      ['design-system', GROUP_PRIORITY.designSystem],
      ['charting', GROUP_PRIORITY.charting],
    ]);
    // Charting imports the design system, so charting ranked higher would
    // walk design-system modules into its own chunk.
    expect(GROUP_PRIORITY.react).toBeGreaterThan(GROUP_PRIORITY.designSystem);
    expect(GROUP_PRIORITY.designSystem).toBeGreaterThan(
      GROUP_PRIORITY.charting,
    );
  });

  it('sets entriesAware on the design-system group only', () => {
    const { groups } = codeSplitting();

    expect(
      groups?.filter((group) => group.entriesAware).map((group) => group.name),
    ).toEqual(['design-system']);
  });

  it('matches the scoped packages under node_modules on either separator', () => {
    const [react, designSystem, charting] = DEFAULT_GROUPS as [
      CodeSplittingGroup,
      CodeSplittingGroup,
      CodeSplittingGroup,
    ];
    const matches = (group: CodeSplittingGroup, id: string): boolean =>
      (group.test as RegExp).test(id);

    expect(matches(react, '/app/node_modules/react/index.js')).toBe(true);
    expect(matches(react, '/app/node_modules/react-dom/client.js')).toBe(true);
    expect(matches(react, '/app/node_modules/scheduler/index.js')).toBe(true);
    expect(matches(react, '/app/node_modules/react-table/index.js')).toBe(
      false,
    );

    const ds = '/app/node_modules/@r0hitsharma/design-system/dist/drawer.js';
    expect(matches(designSystem, ds)).toBe(true);
    expect(matches(designSystem, ds.replaceAll('/', '\\'))).toBe(true);
    // A sibling package sharing the prefix is not the design system.
    expect(
      matches(designSystem, '/app/node_modules/@r0hitsharma/design-systemx/a'),
    ).toBe(false);
    // Nor is a checkout resolved by real path, which is what `npm link` gives.
    expect(
      matches(designSystem, '/src/uikit/packages/design-system/a.js'),
    ).toBe(false);

    expect(
      matches(charting, 'C:\\app\\node_modules\\@r0hitsharma\\charting\\x.js'),
    ).toBe(true);
    expect(matches(charting, ds)).toBe(false);
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
    const chunks = await buildFixture({ codeSplitting: codeSplitting() });

    expect(chunkWith(chunks, 'REACT_MARKER').name).toBe('react');
    expect(chunkWith(chunks, 'CHARTING_MARKER').name).toBe('charting');
    // entriesAware names each subgroup after the entries that reach it.
    expect(chunkWith(chunks, 'DS_BUTTON_MARKER').name).toMatch(
      /^design-system/,
    );
    expect(chunkWith(chunks, 'DS_DRAWER_ONLY_MARKER').name).toMatch(
      /^design-system/,
    );
  });

  it('keeps lazy-only design-system code out of what the entry loads', async () => {
    const chunks = await buildFixture({ codeSplitting: codeSplitting() });

    // The positive half first: the shell's own design-system code is in the
    // initial set, so that set is real and the negative claims mean something.
    expect(isInitial(chunks, 'DS_BUTTON_MARKER')).toBe(true);
    expect(isInitial(chunks, 'REACT_MARKER')).toBe(true);

    expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(false);
    expect(isInitial(chunks, 'CHARTING_MARKER')).toBe(false);
    // Distinct design-system chunks, rather than one that happens to be lazy.
    expect(chunkWith(chunks, 'DS_DRAWER_ONLY_MARKER')).not.toBe(
      chunkWith(chunks, 'DS_BUTTON_MARKER'),
    );
  });

  it('puts drawer-only code in the entry load once entriesAware is dropped', async () => {
    // The control for the case above: the same groups without entriesAware
    // must fail it, or that case is not measuring entriesAware at all.
    const groups = codeSplitting().groups!.map((group) => ({
      ...group,
      entriesAware: false,
    }));
    const chunks = await buildFixture({ codeSplitting: { groups } });

    expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(true);
  });

  it('applies an appended consumer group without disturbing the defaults', async () => {
    const geo: CodeSplittingGroup = {
      name: 'geo',
      test: /[\\/]node_modules[\\/]geo-lib[\\/]/,
    };

    // Without the group, geo-lib is not in a chunk of that name, so the
    // name below is the group's doing.
    const before = await buildFixture({ codeSplitting: codeSplitting() });
    expect(chunkWith(before, 'GEO_LIB_MARKER').name).not.toBe('geo');

    const chunks = await buildFixture({
      codeSplitting: codeSplitting({ groups: [geo] }),
    });

    expect(chunkWith(chunks, 'GEO_LIB_MARKER').name).toBe('geo');
    expect(isInitial(chunks, 'GEO_LIB_MARKER')).toBe(false);
    expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(false);
    expect(chunkWith(chunks, 'DS_BUTTON_MARKER').name).toMatch(
      /^design-system/,
    );
  });

  it('lets a consumer group that outranks a default take its shared modules, as the README warns', async () => {
    // With `includeDependenciesRecursively` on, which is rolldown's default, a
    // group takes the dependencies of what it captures. Ranked above the
    // design-system group, a drawer-only group therefore takes the button the
    // drawer imports, and the entry, which needs that button, now loads the
    // drawer with it. Pinned because the README tells consumers to keep their
    // groups below the defaults for exactly this reason.
    const drawer: CodeSplittingGroup = {
      name: 'drawer',
      test: /[\\/]design-system[\\/]drawer\.js$/,
      priority: GROUP_PRIORITY.designSystem + 1,
    };
    const chunks = await buildFixture({
      codeSplitting: codeSplitting({ groups: [drawer] }),
    });

    expect(chunkWith(chunks, 'DS_BUTTON_MARKER').name).toBe('drawer');
    expect(isInitial(chunks, 'DS_DRAWER_ONLY_MARKER')).toBe(true);
  });

  it('ignores a leftover manualChunks beside it, as the README warns', async () => {
    // rolldown's documented behaviour, pinned here because the README tells
    // consumers to rely on it: with `codeSplitting` set, `manualChunks` is
    // dropped with only a warning. If this starts failing, the README is
    // wrong, not just this test.
    const chunks = await buildFixture({
      codeSplitting: codeSplitting(),
      manualChunks: () => 'everything',
    });

    expect(chunks.some((chunk) => chunk.name === 'everything')).toBe(false);
    expect(chunkWith(chunks, 'REACT_MARKER').name).toBe('react');
  });
});
