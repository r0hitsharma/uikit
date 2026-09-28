# uikit preview

This workspace package builds and publishes a static preview site for UIKit.

It combines:

- Ladle stories for interactive component previews
- A generated Panda Spec JSON documentation view

The preview reuses the shared Panda theme config from the design-system package.

## Local development

From repository root:

```bash
npm run preview:dev
```

## Static build

```bash
npm run preview:build
```

The output is generated at `packages/uikit-preview/dist`.

## Visual snapshot tests

Ladle stories are screenshot-tested with Playwright. The committed snapshots are
macOS/Chromium-specific, so regenerate them on macOS.

From this package:

```bash
npm run snapshot:test           # compare against the committed snapshots
npm run snapshot:update         # re-render only the snapshots a change affects
npm run snapshot:update:all     # re-render every snapshot
npm run snapshot:check-orphans  # flag snapshots with no matching story
```

CI compares on `macos-26`. On a pull request it checks the stories the diff can
affect (changed baselines, plus every story whose bundle includes a changed
module; Panda/token inputs, preview config and rendered-dependency lockfile
changes widen that to all). Pushes to `main` and manual `ci` dispatches check
every story.

If your machine is on a different macOS major, text metrics differ and locally
rendered baselines will not match CI. Dispatch the `snapshot-update` workflow on
your branch instead (`affected` or `all`); it uploads the changed PNGs as the
`snapshot-updates` artifact, and can commit them to the branch
(`commit: true`). Commits pushed by that workflow do not trigger CI, so dispatch
`ci` on the branch afterwards.

```bash
gh workflow run snapshot-update.yml --ref <branch> -f scope=all
gh run download <run-id> -n snapshot-updates -D tests/snapshot.spec.ts-snapshots
```
