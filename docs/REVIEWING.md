# Reviewing changes in this repository

Guidelines for anyone — human or agent — reviewing a PR, a branch, or a working-tree
diff in this repo. Linked from `AGENTS.md`, `CLAUDE.md`, and
`.github/copilot-instructions.md` so every harness picks it up; this file is the
single source of truth. The portable, repo-agnostic half of this method also ships
as the `review-discipline` skill in `packages/agent-marketplace`.

## Repo facts every review must hold

1. **The commit type is a release trigger, not a label.** semantic-release runs the
   conventionalcommits preset over a single lockstep version: `feat` → minor,
   `fix` → patch, `chore` → **no release** (except `chore(deps)`, forced to patch).
   The review test for the type is mechanical: **does it add public API surface?**
   New exports, subpaths, tokens, props, or CLI commands typed as `chore` ship
   nothing until an unrelated release cuts a version — this has happened (#100
   exported two charting primitives as `chore`). Diff the export surface against
   the merge-base when the type looks wrong.
2. **Pre-v1 breaking policy.** Enabling a lint rule in a shared preset breaks
   consumer builds on upgrade; while this repo is v0 that ships as a plain `fix`,
   not `feat!`. Flag it in review so the intent is recorded, but do not block on
   the missing `!`.
3. **This repository is public.** No internal tracker IDs, internal links, or
   internal project names in PR bodies, commits, code, or docs. Review for leaks,
   not just correctness.
4. **Surface means the maintained offering, not the export count.** Re-exports and
   type aliases are near-free to keep, and deleting them forces a version bump the
   day a consumer needs them. Judge a new API by the maintenance burden it takes on
   and the demand evidence behind it (ideally a named consumer workaround it
   deletes); judge a removal by whether it retires real implementation burden.
5. **Stacked PRs are reviewed per layer.** Each PR is a layer over its own base:
   review that layer's diff, not only the combined stack diff — findings that live
   in files a higher layer rewrites or deletes are invisible in the combined view.
   After any rebase that moves work between parents (e.g. trunk absorbed a sibling
   fix), **re-check every PR description against its actual diff**; description
   drift is the default outcome of a rebase, not an edge case.

## Review method

1. **Prove findings by running them.** A plausible mechanism, stated confidently,
   survives review unless someone runs it. Every finding should carry the command,
   test, or probe that reproduces it; every claim about a mechanism (retry,
   caching, chunking, event ordering) must be exercised, not inferred. This cuts
   both ways: it kills false findings too.
2. **Treat the PR body's claims as assertions to falsify.** "Nothing is
   suppressed", "fails loudly", "N findings fixed" — measure each against the
   tree. A claimed property ("this package is now rule-clean") is tested
   repo-wide, not just inside the diff: the goal defines the scope, the diff only
   locates the change.
3. **Run a skeptic pass over clean verdicts.** "Verified clean" and "done well"
   are findings too, and the sharpest misses hide behind them. Give every praised
   or clean-looking region one adversarial probe: non-finite numbers, empty
   collections, killed or aborted processes, a value arriving twice, and — for
   scripts — whether the process actually exits when its work is done.
4. **Review guards as guards.** For any check, gate, or validator, ask how it can
   pass while verifying nothing: an empty input set going green, a count of items
   *discovered* standing in for items *compared*, an unvalidated environment
   variable silencing the diff, a dependency walk that misses an edge kind. A
   guard that can pass vacuously is a liability wearing a safety label.
5. **A wrong justifying comment indicts the code, not just the wording.** When a
   comment defending a design turns out to be false ("X flushes before Y, so this
   is safe"), the default question is whether the design survives without the
   claim — not how to soften the sentence.
6. **Exit codes, not output tails.** A piped `| tail` swallows a mid-stream
   failure; `npm run --workspaces` keeps going after a workspace fails. Verify
   green by exit status, per workspace where it matters.
7. **Findings land where the work lives.** Post them on the PR (or file them)
   before summarizing anywhere else. A chat or report summary is an index, not the
   record — anything compressed away effectively never happened, and the next
   reviewer will re-derive it at full cost.
8. **Synthesize across dimensions before concluding.** When multiple reviewers or
   agents cover different angles (correctness, tests, comments, deps), cross-join
   their outputs: the sharpest finding is often a fact from one report applied to
   code another report analyzed.

## Repo mechanics that bite reviews

- **Lint:** every workspace runs `oxlint --max-warnings=0`; a single warning fails
  the job. Suppressions follow the house pattern
  `// oxlint-disable-next-line <rule> -- <why>` with a real justification.
- **Visual snapshots:** on PRs, CI scopes the Playwright suite to story ids derived
  from *changed PNG filenames*; the merge queue runs the full suite. A
  pixel-affecting change whose baseline was never regenerated therefore passes PR
  CI and fails the queue. When tokens, recipes, or shared styles change, verify by
  running the full local suite — Panda inputs (`src/tokens/`, `src/recipes/`,
  `panda-preset.ts`, `panda.shared.ts`, `staticCss.ts`) compile into the global
  stylesheet every story consumes by class name, outside any story's JS module
  graph.
- **Preview deploys** share a gh-pages concurrency group that cancels rather than
  queues: parallel pushes cancel each other's `build-and-deploy`. That failure is
  not a code failure — re-run serially.
- **Snapshot tooling is itself guard code** (`packages/uikit-preview/scripts/`):
  apply rule 4 above to any change there.
