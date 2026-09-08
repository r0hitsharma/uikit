# Agent guide

Shared TS/React frontend toolkit monorepo (`@archon-research/*`): config packages,
a design system, charting, HTTP client utilities, and the Ladle preview/snapshot
suite. npm workspaces; published via semantic-release with a single lockstep
version.

- **Reviewing anything** (a PR, a stack, a branch, a working-tree diff): read
  [`docs/REVIEWING.md`](docs/REVIEWING.md) first and follow it. It carries the
  release-trigger semantics of commit types, the public-repo constraints, the
  per-layer rules for stacked PRs, and the review method.
- This repository is **public**: no internal tracker IDs, internal links, or
  internal project names in PRs, commits, code, or docs.
- Lint runs at `--max-warnings=0` per workspace; verify green by exit codes, not
  output tails.
