import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { OpenSpecGuardError } from './errors.js';
import type { MatchReason, Verdict } from './types.js';

/**
 * The baseline.
 *
 * A repository that adopts this tool starts with hundreds of uncovered
 * scenarios. Asking it to fix them all before turning the gate on means the
 * gate is never turned on. The baseline freezes what is already uncovered, so
 * the gate only fails on a scenario that becomes uncovered AFTER adoption.
 *
 * Two decisions worth stating:
 *
 * 1. An entry matches on id AND reason. If a criterion was baselined as
 *    `no-candidate` and now reads `selector-unmatched`, someone just wrote a
 *    selector that points at nothing. That is a new mistake, not old debt, and
 *    the gate should fire.
 * 2. Criterion ids already hash the scenario text, so editing a scenario
 *    changes its id, its entry stops matching, and the criterion is checked
 *    again. Rewriting a scenario is exactly when you want to be asked about
 *    its test.
 */

export const DEFAULT_BASELINE_PATH = '.openspec-guard-baseline.json';
export const BASELINE_SCHEMA_VERSION = 1;

export interface BaselineEntry {
  id: string;
  reason: MatchReason;
  verdict: Verdict;
  /** Informational, so the file can be reviewed in a pull request. */
  capability: string;
  scenario: string;
  file: string;
}

export interface BaselineFile {
  schemaVersion: number;
  tool: string;
  /** Sorted by (file, id), so the file diffs cleanly. */
  entries: BaselineEntry[];
}

export interface Baseline {
  /** Path relative to cwd, POSIX separators. */
  file: string;
  byId: Map<string, BaselineEntry>;
}

function isEntry(value: unknown): value is BaselineEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && typeof entry.reason === 'string';
}

/**
 * Reads a baseline. A missing file is an error, not an empty baseline: a typo
 * in `--baseline` would otherwise silently un-suppress everything and fail a
 * build for reasons nobody can see.
 */
export async function loadBaseline(cwd: string, relativePath: string): Promise<Baseline> {
  const absolute = path.resolve(cwd, relativePath);

  let raw: string;
  try {
    raw = await readFile(absolute, 'utf8');
  } catch {
    throw new OpenSpecGuardError(
      'E_BASELINE_NOT_FOUND',
      `No baseline at ${relativePath}. Create one with --update-baseline, ` +
        'or drop --baseline to check everything.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OpenSpecGuardError('E_BASELINE_INVALID', `${relativePath} is not valid JSON.`);
  }

  const file = parsed as Partial<BaselineFile>;
  if (file.schemaVersion !== BASELINE_SCHEMA_VERSION || !Array.isArray(file.entries)) {
    throw new OpenSpecGuardError(
      'E_BASELINE_INVALID',
      `${relativePath} is not a baseline of schema version ${BASELINE_SCHEMA_VERSION}. ` +
        'Regenerate it with --update-baseline.',
    );
  }

  const byId = new Map<string, BaselineEntry>();
  for (const entry of file.entries) {
    if (!isEntry(entry)) {
      throw new OpenSpecGuardError(
        'E_BASELINE_INVALID',
        `${relativePath} holds an entry without an id and a reason.`,
      );
    }
    byId.set(entry.id, entry);
  }

  return { file: relativePath, byId };
}

export interface BaselineCandidate {
  id: string;
  verdict: Verdict;
  reason: MatchReason;
  capability: string;
  scenario: string;
  file: string;
}

/** True when this exact criterion, failing this exact way, was already known. */
export function isBaselined(baseline: Baseline | null, candidate: BaselineCandidate): boolean {
  if (!baseline) return false;
  if (candidate.verdict === 'pass' || candidate.verdict === 'skip') return false;
  return baseline.byId.get(candidate.id)?.reason === candidate.reason;
}

/**
 * Entries that no longer correspond to anything: the scenario was fixed,
 * rewritten or deleted. Reported so the file can be pruned rather than growing
 * forever.
 */
export function staleEntries(
  baseline: Baseline | null,
  present: readonly BaselineCandidate[],
): BaselineEntry[] {
  if (!baseline) return [];
  const live = new Set<string>();
  for (const candidate of present) {
    if (isBaselined(baseline, candidate)) live.add(candidate.id);
  }
  return [...baseline.byId.values()]
    .filter((entry) => !live.has(entry.id))
    .sort((left, right) => compareEntries(left, right));
}

function compareEntries(left: BaselineEntry, right: BaselineEntry): number {
  if (left.file !== right.file) return left.file < right.file ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/** Everything currently uncovered becomes the new frozen debt. */
export function buildBaseline(candidates: readonly BaselineCandidate[]): BaselineFile {
  const entries = candidates
    .filter((candidate) => candidate.verdict !== 'pass' && candidate.verdict !== 'skip')
    .map((candidate) => ({
      id: candidate.id,
      reason: candidate.reason,
      verdict: candidate.verdict,
      capability: candidate.capability,
      scenario: candidate.scenario,
      file: candidate.file,
    }))
    .sort(compareEntries);

  return { schemaVersion: BASELINE_SCHEMA_VERSION, tool: 'openspec-guard', entries };
}

export async function writeBaseline(
  cwd: string,
  relativePath: string,
  file: BaselineFile,
): Promise<void> {
  // Same guarantee as the JSON report: no clock, no absolute path, stable
  // ordering. A baseline is committed, so it has to diff cleanly.
  await writeFile(path.resolve(cwd, relativePath), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}

export interface BaselineDiff {
  added: BaselineEntry[];
  removed: BaselineEntry[];
}

export function diffBaseline(previous: Baseline | null, next: BaselineFile): BaselineDiff {
  const before = previous?.byId ?? new Map<string, BaselineEntry>();
  const after = new Map(next.entries.map((entry) => [entry.id, entry]));

  return {
    added: next.entries.filter((entry) => before.get(entry.id)?.reason !== entry.reason),
    removed: [...before.values()]
      .filter((entry) => after.get(entry.id)?.reason !== entry.reason)
      .sort(compareEntries),
  };
}
