import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generate } from './generate.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const sourcesPath = join(packageRoot, 'sources.json');
const lockPath = join(packageRoot, 'sources.lock.json');
const contentRoot = join(packageRoot, 'content');

const currentFilePath = fileURLToPath(import.meta.url);
const dryRun = process.argv.includes('--dry-run');

export interface SourceEntry {
  id: string;
  kind: 'skill' | 'agent';
  sourceType: string;
  upstream: string;
  pinnedRevision: string;
  // remote-markdown only: file path inside the upstream repo, and the branch
  // Renovate tracks to propose new pinnedRevision digests.
  path?: string;
  branch?: string;
}

export interface LockEntry {
  id: string;
  kind: 'skill' | 'agent';
  sourceType: string;
  pinnedRevision: string;
  resolved: string;
  contentSha256?: string;
}

function isSourceEntry(value: unknown): value is SourceEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const base =
    typeof candidate.id === 'string' &&
    (candidate.kind === 'skill' || candidate.kind === 'agent') &&
    typeof candidate.sourceType === 'string' &&
    typeof candidate.upstream === 'string' &&
    typeof candidate.pinnedRevision === 'string';
  if (!base || candidate.sourceType !== 'remote-markdown') {
    return base;
  }
  return (
    typeof candidate.path === 'string' &&
    typeof candidate.branch === 'string' &&
    /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(
      candidate.upstream as string,
    ) &&
    /^[0-9a-f]{40}$/.test(candidate.pinnedRevision as string)
  );
}

export async function readSourceEntries(): Promise<SourceEntry[]> {
  const raw = await readFile(sourcesPath, 'utf8');
  const parsed = JSON.parse(raw) as { sources?: unknown };
  if (!Array.isArray(parsed.sources)) {
    throw new Error('sources.json must contain a "sources" array.');
  }
  const invalid = parsed.sources.filter((entry) => !isSourceEntry(entry));
  if (invalid.length > 0) {
    throw new Error(
      `sources.json contains invalid entries: ${JSON.stringify(invalid)}`,
    );
  }
  return parsed.sources as SourceEntry[];
}

export function contentPath(source: SourceEntry): string {
  return source.kind === 'agent'
    ? join(contentRoot, 'agents', `${source.id}.md`)
    : join(contentRoot, 'skills', source.id, 'SKILL.md');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function rawUrl(source: SourceEntry): string {
  const repo = source.upstream.replace('https://github.com/', '');
  return `https://raw.githubusercontent.com/${repo}/${source.pinnedRevision}/${source.path}`;
}

async function fetchUpstream(source: SourceEntry): Promise<string> {
  const url = rawUrl(source);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${source.id} from ${url}: ${response.status} ${response.statusText}. ` +
        'If the upstream file moved, update "path" in sources.json.',
    );
  }
  return response.text();
}

async function toLockEntry(source: SourceEntry): Promise<LockEntry> {
  const relativeContentPath = contentPath(source).replace(
    `${resolve(packageRoot, '..', '..')}/`,
    '',
  );
  if (source.sourceType !== 'remote-markdown') {
    return {
      id: source.id,
      kind: source.kind,
      sourceType: source.sourceType,
      pinnedRevision: source.pinnedRevision,
      resolved: relativeContentPath,
    };
  }

  // Vendored content is written verbatim: repo-specific guidance belongs in a
  // local-authored skill, not as a silent patch that the next bump drops.
  const text = await fetchUpstream(source);
  if (!dryRun) {
    await mkdir(dirname(contentPath(source)), { recursive: true });
    await writeFile(contentPath(source), text, 'utf8');
  }
  return {
    id: source.id,
    kind: source.kind,
    sourceType: source.sourceType,
    pinnedRevision: source.pinnedRevision,
    resolved: rawUrl(source),
    contentSha256: sha256(text),
  };
}

async function main() {
  const sources = await readSourceEntries();
  const lock = {
    lockVersion: 2,
    sources: await Promise.all(sources.map(toLockEntry)),
  };

  if (dryRun) {
    process.stdout.write(`${JSON.stringify(lock, null, 2)}\n`);
    return;
  }

  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  await generate();
}

if (process.argv[1] === currentFilePath) {
  await main();
}
