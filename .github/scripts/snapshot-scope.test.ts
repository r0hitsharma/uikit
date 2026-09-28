// Run with: node --test .github/scripts/snapshot-scope.test.ts

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type {
  PreviewMeta,
  StoryDeps,
} from '../../packages/uikit-preview/scripts/story-mapping.ts';
import { snapshotScope, uncoveredPackages } from './snapshot-scope.ts';

const STORIES = 'packages/uikit-preview/src/stories';
const PNG = (id: string) =>
  `packages/uikit-preview/tests/snapshot.spec.ts-snapshots/${id}-chromium-darwin.png`;

const deps: StoryDeps = {
  modules: {
    'packages/design-system/dist/components/Button.js': [
      `${STORIES}/atoms/button.stories.tsx`,
      `${STORIES}/molecules/toolbar.stories.tsx`,
    ],
    'packages/design-system/dist/components/Badge.js': [
      `${STORIES}/atoms/badge.stories.tsx`,
    ],
    'packages/charting/dist/LineChart.js': [
      `${STORIES}/charts/line.stories.tsx`,
    ],
    [`${STORIES}/atoms/button.stories.tsx`]: [
      `${STORIES}/atoms/button.stories.tsx`,
    ],
  },
};

const meta: PreviewMeta = {
  stories: {
    'atoms--button--primary': {
      filePath: 'src/stories/atoms/button.stories.tsx',
    },
    'atoms--button--ghost': {
      filePath: 'src/stories/atoms/button.stories.tsx',
    },
    'atoms--badge--default': {
      filePath: 'src/stories/atoms/badge.stories.tsx',
    },
    'molecules--toolbar--default': {
      filePath: 'src/stories/molecules/toolbar.stories.tsx',
    },
    'charts--line--default': {
      filePath: 'src/stories/charts/line.stories.tsx',
    },
  },
};

const scope = (
  changed: string[],
  lockfile?: Parameters<typeof snapshotScope>[0]['lockfile'],
) => snapshotScope({ changed, deps, meta, lockfile });

const ids = (changed: string[]) => {
  const result = scope(changed);
  assert.equal(result.kind, 'stories', JSON.stringify(result));
  return result.kind === 'stories' ? result.ids : [];
};

describe('snapshotScope', () => {
  test('a component source change selects the stories that render it', () => {
    assert.deepEqual(
      ids(['packages/design-system/src/components/Button.tsx']),
      [
        'atoms--button--ghost',
        'atoms--button--primary',
        'molecules--toolbar--default',
      ],
    );
  });

  test('a story file change selects exactly its stories', () => {
    assert.deepEqual(ids([`${STORIES}/atoms/badge.stories.tsx`]), [
      'atoms--badge--default',
    ]);
  });

  test('recipe, token and preset changes run every story', () => {
    for (const file of [
      'packages/design-system/src/recipes/button.recipe.ts',
      'packages/design-system/src/tokens/colors.ts',
      'packages/design-system/src/panda-preset.ts',
      'packages/design-system/panda.shared.ts',
    ]) {
      assert.equal(scope([file]).kind, 'all', file);
    }
  });

  test('a non-story preview file runs every story', () => {
    assert.equal(scope(['packages/uikit-preview/panda.config.ts']).kind, 'all');
    assert.equal(
      scope(['packages/uikit-preview/tests/snapshot.spec.ts']).kind,
      'all',
    );
  });

  test('docs and unit tests select nothing, even inside rendered packages', () => {
    assert.deepEqual(
      ids([
        'docs/REVIEWING.md',
        'README.md',
        'packages/design-system/README.md',
        'packages/uikit-preview/README.md',
        'packages/design-system/src/panda-preset.test.ts',
        'packages/design-system/src/components/Button.test.tsx',
      ]),
      [],
    );
  });

  test('CI config and packages no story renders select nothing', () => {
    assert.deepEqual(
      ids([
        '.github/workflows/ci.yml',
        '.github/changed-files.yml',
        'packages/http-client-core/src/client.ts',
      ]),
      [],
    );
  });

  test('the demo relay Worker selects nothing unless a story bundles it', () => {
    const relay = 'packages/uikit-preview/demo-relay/src/worker.ts';
    assert.deepEqual(ids([relay]), []);
    assert.equal(
      snapshotScope({
        changed: [relay],
        deps: {
          modules: {
            ...deps.modules,
            'packages/uikit-preview/demo-relay/src/shared.ts': [
              `${STORIES}/atoms/badge.stories.tsx`,
            ],
          },
        },
        meta,
      }).kind,
      'all',
    );
  });

  test('changed baselines are unioned with changed sources', () => {
    const result = scope([
      PNG('atoms--badge--default'),
      'packages/charting/src/LineChart.tsx',
    ]);
    assert.deepEqual(result, {
      kind: 'stories',
      ids: ['atoms--badge--default', 'charts--line--default'],
      fromPngs: ['atoms--badge--default'],
      fromSources: ['charts--line--default'],
      unmatched: [],
    });
  });

  test('a baseline whose story is gone selects nothing', () => {
    assert.deepEqual(ids([PNG('atoms--removed--default')]), []);
  });

  test('changed code no story bundles is reported as unmatched', () => {
    const result = scope(['packages/design-system/src/components/Unused.tsx']);
    assert.equal(result.kind, 'stories');
    if (result.kind === 'stories') {
      assert.deepEqual(result.ids, []);
      assert.deepEqual(result.unmatched, [
        'packages/design-system/src/components/Unused.tsx',
      ]);
    }
  });

  describe('package-lock.json', () => {
    test('a dependency change in a rendered package runs every story', () => {
      const result = scope(['package-lock.json'], {
        kind: 'workspaces',
        dirs: ['packages/http-client-core', 'packages/design-system'],
      });
      assert.equal(result.kind, 'all');
    });

    test('a preview dependency change (Playwright, Ladle) runs every story', () => {
      const result = scope(['package-lock.json'], {
        kind: 'workspaces',
        dirs: ['packages/uikit-preview'],
      });
      assert.equal(result.kind, 'all');
    });

    test('a change confined to packages no story renders selects nothing', () => {
      assert.deepEqual(
        snapshotScope({
          changed: ['package-lock.json'],
          deps,
          meta,
          lockfile: { kind: 'workspaces', dirs: ['packages/http-client-core'] },
        }),
        {
          kind: 'stories',
          ids: [],
          fromPngs: [],
          fromSources: [],
          unmatched: [],
        },
      );
    });

    test('an unattributable lockfile change runs every story', () => {
      assert.equal(
        scope(['package-lock.json'], {
          kind: 'all',
          reason: 'root entry changed',
        }).kind,
        'all',
      );
    });

    test('a lockfile change without its impact is a caller bug', () => {
      assert.throws(() => scope(['package-lock.json']));
    });
  });
});

describe('uncoveredPackages', () => {
  const yaml = (items: string[]) =>
    [
      'lint:',
      '  - packages/**',
      '',
      '# comment',
      'visual_snapshots:',
      ...items.map((item) => `  - ${item}`),
      '# trailing comment',
      '',
      'other:',
      '  - packages/charting/**',
    ].join('\n');

  test('reports rendered packages the group does not list', () => {
    assert.deepEqual(
      uncoveredPackages(
        yaml(['packages/uikit-preview/**']),
        'visual_snapshots',
        deps,
      ),
      ['packages/charting', 'packages/design-system'],
    );
  });

  test('passes when every rendered package is listed', () => {
    assert.deepEqual(
      uncoveredPackages(
        yaml([
          'packages/uikit-preview/**',
          'packages/design-system/**',
          'packages/charting/**',
        ]),
        'visual_snapshots',
        deps,
      ),
      [],
    );
  });

  test('a missing group is an error, not an empty pass', () => {
    assert.throws(() =>
      uncoveredPackages('lint:\n  - packages/**\n', 'visual_snapshots', deps),
    );
  });
});
