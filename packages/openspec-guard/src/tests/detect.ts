import type { Manifest } from '../discovery.js';
import { OpenSpecGuardError } from '../errors.js';

/**
 * Runner detection.
 *
 * Be clear about what this does NOT do: detection does not change extraction.
 * `describe`, `it` and `test` are spelled the same in Vitest and in Jest, and
 * we never execute anything, so there is nothing to branch on.
 *
 * It exists for three reasons: it puts a fact in the JSON report, it produces
 * a clear error when a repository has no runner at all, and it stops us from
 * analysing such a repository while believing otherwise.
 */

export type Runner = 'vitest' | 'jest';

export interface RunnerDetection {
  runner: Runner;
  /** Where the answer came from, one line per piece of evidence. */
  evidence: string[];
}

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function collect(manifests: readonly Manifest[], runner: Runner): string[] {
  const evidence: string[] = [];

  for (const manifest of manifests) {
    for (const field of DEPENDENCY_FIELDS) {
      const dependencies = record(manifest.json[field]);
      if (dependencies && runner in dependencies) {
        evidence.push(`${manifest.file}#${field}.${runner}`);
      }
    }

    const scripts = record(manifest.json.scripts);
    if (scripts) {
      for (const [name, command] of Object.entries(scripts)) {
        if (typeof command === 'string' && new RegExp(`\\b${runner}\\b`).test(command)) {
          evidence.push(`${manifest.file}#scripts.${name}`);
        }
      }
    }

    // Jest also configures itself through a `jest` key in the manifest.
    if (runner === 'jest' && record(manifest.json.jest)) {
      evidence.push(`${manifest.file}#jest`);
    }
  }

  return evidence;
}

/**
 * Config files are evidence by their presence only. We never evaluate one:
 * running a project's config to learn its runner would be both slow and a
 * side effect.
 */
function configEvidence(runnerConfigFiles: readonly string[], runner: Runner): string[] {
  return runnerConfigFiles.filter((file) => file.split('/').pop()?.startsWith(runner) === true);
}

export function detectRunner(
  manifests: readonly Manifest[],
  runnerConfigFiles: readonly string[],
  override?: Runner | undefined,
): RunnerDetection {
  if (override !== undefined) {
    return { runner: override, evidence: [`--runner ${override}`] };
  }

  const vitest = [...collect(manifests, 'vitest'), ...configEvidence(runnerConfigFiles, 'vitest')];
  const jest = [...collect(manifests, 'jest'), ...configEvidence(runnerConfigFiles, 'jest')];

  if (vitest.length === 0 && jest.length === 0) {
    throw new OpenSpecGuardError(
      'E_RUNNER_NOT_FOUND',
      'No Vitest or Jest setup found under the code root. ' +
        'Pass --runner vitest|jest if the runner lives somewhere this cannot see.',
    );
  }

  // A repository can hold both. We report the one with more evidence, and list
  // everything we saw so the choice is auditable; ties go to Vitest, which is
  // the more common setup in TypeScript repositories today.
  const runner: Runner = jest.length > vitest.length ? 'jest' : 'vitest';
  return { runner, evidence: [...vitest, ...jest] };
}
