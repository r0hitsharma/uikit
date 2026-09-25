# Agent guide

Shared TS/React frontend toolkit monorepo: config packages, a design system,
charting, HTTP client utilities, WebMCP/relay packages, and the Ladle
preview/snapshot suite. npm workspaces; published via semantic-release with a
single lockstep version. Human-facing setup lives in
[`DEVELOPMENT.md`](DEVELOPMENT.md); this file is what agents get wrong without it.

- **Reviewing anything** (a PR, a stack, a branch, a working-tree diff): read
  [`docs/REVIEWING.md`](docs/REVIEWING.md) first and follow it. It carries the
  release-trigger semantics of commit types, the public-repo constraints, the
  per-layer rules for stacked PRs, and the review method.
- This repository is **public**: no internal tracker IDs, internal links, or
  internal project names in PRs, commits, code, or docs. That includes the names
  of downstream consumer apps and their findings; describe the problem, not who
  hit it. Link tracker issues to PRs by hand, after the PR exists.
- Lint runs at `--max-warnings=0` per workspace; verify green by exit codes, not
  output tails.

## Environment

- The toolchain comes from the Nix dev shell loaded by direnv (`.envrc`, which is
  gitignored). Never use `~/.volta`, a global node, or hand-built mise paths. In a
  non-interactive shell, run commands as `direnv exec . <cmd>`; avoid
  `bash -lc`, whose login output pollutes stdout.
- **New worktree**: copy `.envrc` from the main checkout, `direnv allow`, then
  `npm ci`. Before Ladle, snapshots, or cross-package tests, also `npm run build`:
  preview and several tests import sibling packages' `dist/`.
- A downstream app may be `npm link`ed to this checkout. Ask before running a
  build or codegen in the main checkout; prefer a worktree.

## Working rules

- **Root cause before fix.** When something that used to work breaks (a Renovate
  lockfile, a CI job, a snapshot), explain what changed and why before editing.
  Never "fix" by deleting `node_modules`/`package-lock.json` and reinstalling:
  that hides the cause and rewrites the lockfile.
- **Nothing leaves the machine unasked.** Commit locally; push, open PRs (always
  as drafts), dispatch workflows, publish, or post comments only when told to.
- **Never rewrite published history.** Undo a pushed commit with `git revert`,
  not a force-push. Tags and release notes are never deleted to redo a release;
  re-dispatch the publish workflow at the existing tag instead.
- **Stacks go through `gh stack`** (`sync`, `push`, `submit`), not hand-managed
  bases. PR bodies describe only their own layer: no stack notes, no links to
  sibling PRs.
- **Commits**: discrete conventional commits, one concern each. `feat` only for
  consumer-facing API additions; see `docs/REVIEWING.md` for why the type matters.
- **PR descriptions**: say what the PR contains, readable in a few minutes. Link
  the CI run when citing test results. No tool-attribution footers.
- **Review comments**: reply inside each thread (brief, naming the fixing commit),
  never as a standalone summary comment. Push the fix before resolving its thread.

## Agent tooling in this repo

- `packages/agent-marketplace` ships the skills and agents published to
  consumers. Edit `content/`, never the generated `claude-plugin/` or
  `copilot-plugin/`, then run `npm run refresh --workspace
  @r0hitsharma/agent-marketplace` (CI runs `check`). Vendored upstream skills
  are pinned in `sources.json`, bumped by Renovate, and must stay verbatim: put
  uikit-specific guidance in a local-authored skill.
