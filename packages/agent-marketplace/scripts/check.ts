import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { LockEntry } from './refresh.ts';
import {
  contentPath,
  lockEntryFor,
  readSourceEntries,
  sha256,
} from './refresh.ts';

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

// Offline: a Renovate digest bump that skipped `refresh`, a sources.json edit
// (path, upstream, sourceType) that skipped it, or a hand edit to vendored
// content all surface here instead of shipping silently.
async function ensureLockMatchesSources(): Promise<void> {
  const refreshCommand =
    '`npm run refresh --workspace @r0hitsharma/agent-marketplace`';
  const refreshHint = `Run ${refreshCommand}.`;
  const sources = await readSourceEntries();
  if (sources.length === 0) {
    throw new Error('sources.json has no entries.');
  }
  const lock = JSON.parse(await readFile(lockPath, 'utf8')) as {
    lockVersion?: unknown;
    sources?: unknown;
  };
  if (lock.lockVersion !== 2 || !Array.isArray(lock.sources)) {
    throw new Error(
      `sources.lock.json must have lockVersion 2 and a "sources" array. ${refreshHint}`,
    );
  }
  const lockEntries = lock.sources as LockEntry[];
  const lockById = new Map(lockEntries.map((entry) => [entry.id, entry]));
  if (lockById.size !== lockEntries.length) {
    throw new Error(`sources.lock.json has duplicate ids. ${refreshHint}`);
  }
  const sourceIds = new Set(sources.map((source) => source.id));
  const extra = [...lockById.keys()].filter((id) => !sourceIds.has(id));
  if (extra.length > 0) {
    throw new Error(
      `sources.lock.json has entries not in sources.json: ${extra.join(', ')}. ${refreshHint}`,
    );
  }

  for (const source of sources) {
    const locked = lockById.get(source.id);
    // contentSha256 is the one field sources.json cannot predict; the content
    // hash check below covers it.
    const expected =
      locked &&
      lockEntryFor(
        source,
        source.sourceType === 'remote-markdown'
          ? locked.contentSha256
          : undefined,
      );
    if (!locked || JSON.stringify(locked) !== JSON.stringify(expected)) {
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
        `Vendored "${source.id}" differs from the content sources.lock.json ` +
          `records for ${source.pinnedRevision}. Move repo-specific guidance ` +
          `into a local-authored skill, then run ${refreshCommand}.`,
      );
    }
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
