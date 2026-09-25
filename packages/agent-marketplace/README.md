# agent-marketplace

Marketplace-first plugin package for reusable UI-focused skills and specialist agents.

This package keeps all source content in one normalized layer and generates:

- Claude plugin output
- Copilot CLI plugin output
- Claude marketplace manifest (repo root)
- Copilot CLI marketplace manifest (repo root)

## Structure

```text
packages/agent-marketplace/
  content/
    skills/<skill>/SKILL.md
    agents/<agent>.md
  scripts/
    generate.ts
    refresh.ts
    check.ts
  sources.json
  sources.lock.json
  claude-plugin/        # generated
  copilot-plugin/       # generated
```

## Commands

From repository root:

```bash
npm run generate --workspace @r0hitsharma/agent-marketplace
```

```bash
npm run refresh --workspace @r0hitsharma/agent-marketplace
```

```bash
npm run refresh:dry-run --workspace @r0hitsharma/agent-marketplace
```

```bash
npm run check --workspace @r0hitsharma/agent-marketplace
```

## Source Registry Model

`sources.json` tracks, per skill or agent:

- logical id and kind (`skill` or `agent`)
- source type: `local-authored` (edited in `content/`) or `remote-markdown` (vendored)
- for `remote-markdown`: `upstream` GitHub repo, `path` inside it, tracked `branch`, and the `pinnedRevision` commit
- normalization notes

`refresh` fetches every `remote-markdown` file verbatim at its pinned commit into
`content/`, writes `sources.lock.json` (with a sha256 of each vendored file), and
regenerates the plugin output. `check` (the CI gate) fails when the lock is stale
against `sources.json`, when vendored content was edited by hand, or when the
generated output drifts from `content/`. Put uikit-specific guidance in a
local-authored skill, never as a patch to vendored content.

Renovate bumps `pinnedRevision` (a regex manager in `renovate.json5`, grouped as
`agent-skills`, subject to the 7-day minimum release age) and runs `refresh` as a
post-upgrade task, so the PR carries the new content. If an upstream file moves,
`refresh` fails with a hint to update `path`.

## Add New Skill

1. Add normalized content in `content/skills/<new-skill>/SKILL.md` (local), or a
   `remote-markdown` entry with `upstream`/`path`/`branch`/`pinnedRevision`.
2. Add source metadata in `sources.json`.
3. Run refresh:

```bash
npm run refresh --workspace @r0hitsharma/agent-marketplace
```

## Validation Checklist

- `npm run check --workspace @r0hitsharma/agent-marketplace` (CI gate: generated plugin output matches `content/`)
- `claude plugin validate .`
- `claude plugin validate ./packages/agent-marketplace/claude-plugin`
- `copilot plugin install ./packages/agent-marketplace/copilot-plugin`

If CLI validation schemas evolve, keep generation stable and only adjust manifest fields.

## Recommended Installation Pattern

Prefer GitHub marketplace installs instead of direct local path installs.

1. Keep marketplace manifests current:
  - `.claude-plugin/marketplace.json`
  - `.github/plugin/marketplace.json`
2. Add marketplace from GitHub in each CLI.
3. Install plugin by name from marketplace.

Claude Code team marketplace setup guide:

- https://code.claude.com/docs/en/discover-plugins#configure-team-marketplaces

Typical commands:

```bash
claude plugin marketplace add https://github.com/r0hitsharma/uikit.git
claude plugin install uikit-agent-marketplace

copilot plugin marketplace add https://github.com/r0hitsharma/uikit.git
copilot plugin install uikit-agent-marketplace@uikit-plugins
```
