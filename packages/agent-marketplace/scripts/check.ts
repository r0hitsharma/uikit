import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LockEntry } from './refresh.ts';
import { contentPath, readSourceEntries, sha256 } from './refresh.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');

const sourcesPath = join(packageRoot, 'sources.json');
const lockPath = join(packageRoot, 'sources.lock.json');
const contentRoot = join(packageRoot, 'content');
const claudeOutputRoot = join(packageRoot, 'claude-plugin');
const copilotOutputRoot = join(packageRoot, 'copilot-plugin');

interface SourceEntry {
  id: string;
  kind: 'skill' | 'agent';
  sourceType: string;
  upstream: string;
  pinnedRevision: string;
}

interface SourcesFile {
  sources: SourceEntry[];
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

async function ensureFileEquals(
  leftPath: string,
  rightPath: string,
): Promise<void> {
  const [left, right] = await Promise.all([
    readFile(leftPath, 'utf8'),
    readFile(rightPath, 'utf8'),
  ]);

  if (left !== right) {
    throw new Error(`Drift detected between ${leftPath} and ${rightPath}`);
  }
}

// Offline: a Renovate digest bump that skipped `refresh`, or a hand edit to
// vendored content, both surface here instead of shipping silently.
async function ensureLockMatchesSources(): Promise<void> {
  const sources = await readSourceEntries();
  const lock = JSON.parse(await readFile(lockPath, 'utf8')) as {
    sources?: LockEntry[];
  };
  const lockById = new Map(
    (lock.sources ?? []).map((entry) => [entry.id, entry]),
  );
  const refreshHint =
    'Run `npm run refresh --workspace @r0hitsharma/agent-marketplace`.';

  for (const source of sources) {
    const locked = lockById.get(source.id);
    if (!locked || locked.pinnedRevision !== source.pinnedRevision) {
      throw new Error(
        `sources.lock.json is stale for "${source.id}". ${refreshHint}`,
      );
    }
    if (source.sourceType !== 'remote-markdown') {
      continue;
    }
    const text = await readFile(contentPath(source), 'utf8');
    if (sha256(text) !== locked.contentSha256) {
      throw new Error(
        `Vendored "${source.id}" differs from upstream ${source.pinnedRevision}. ` +
          `Move repo-specific guidance into a local-authored skill, then ${refreshHint}`,
      );
    }
  }
  if (lockById.size !== sources.length) {
    throw new Error(`sources.lock.json has extra entries. ${refreshHint}`);
  }
}

async function main() {
  await ensureLockMatchesSources();

  const raw = await readFile(sourcesPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<SourcesFile>;
  if (!Array.isArray(parsed.sources)) {
    throw new Error('sources.json must contain a "sources" array.');
  }

  const skills = sortById(
    parsed.sources.filter((entry) => entry.kind === 'skill'),
  );
  const agents = sortById(
    parsed.sources.filter((entry) => entry.kind === 'agent'),
  );

  for (const skill of skills) {
    await ensureFileEquals(
      join(contentRoot, 'skills', skill.id, 'SKILL.md'),
      join(claudeOutputRoot, 'skills', skill.id, 'SKILL.md'),
    );
    await ensureFileEquals(
      join(contentRoot, 'skills', skill.id, 'SKILL.md'),
      join(copilotOutputRoot, 'skills', skill.id, 'SKILL.md'),
    );
  }

  for (const agent of agents) {
    await ensureFileEquals(
      join(contentRoot, 'agents', `${agent.id}.md`),
      join(claudeOutputRoot, 'agents', `${agent.id}.md`),
    );
    await ensureFileEquals(
      join(contentRoot, 'agents', `${agent.id}.md`),
      join(copilotOutputRoot, 'agents', `${agent.id}.md`),
    );
  }
}

await main();
