import path from 'node:path';

import type { CheckInput } from '../commands/check.js';
import { OpenSpecGuardError } from '../errors.js';
import type { Runner } from '../tests/detect.js';
import type { Verdict } from '../types.js';

/**
 * Reading the Action's inputs.
 *
 * A GitHub Action receives its inputs as `INPUT_<NAME>` environment variables,
 * uppercased with spaces turned into underscores. That is the entire contract,
 * so this reads them directly instead of pulling in `@actions/core`: one fewer
 * dependency inside a bundle that has to ship self-contained.
 *
 * Kept as a pure function of an environment so the mapping is testable without
 * a runner.
 */

export interface ActionConfig {
  check: CheckInput;
  format: 'terminal' | 'json';
  annotations: boolean;
  maxAnnotations: number;
  summary: boolean;
}

export type Env = Record<string, string | undefined>;

const VERDICTS = new Set<Verdict>(['pass', 'uncertain', 'fail', 'skip']);
const RUNNERS = new Set<Runner>(['vitest', 'jest']);

function read(env: Env, name: string): string | undefined {
  // GitHub uppercases the input name and turns SPACES into underscores. Hyphens
  // are kept, so `working-directory` arrives as INPUT_WORKING-DIRECTORY. Getting
  // this wrong makes every hyphenated input silently invisible.
  const raw = env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Action inputs are always strings, and an unset boolean input arrives as the
 * empty string. Anything other than a clear true or false is a mistake worth
 * reporting rather than guessing at.
 */
function readBoolean(env: Env, name: string, fallback: boolean): boolean {
  const raw = read(env, name);
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new OpenSpecGuardError(
    'E_OPTION',
    `Input ${JSON.stringify(name)} expects true or false, got ${JSON.stringify(raw)}.`,
  );
}

function readNumber(env: Env, name: string, min: number, max: number): number | undefined {
  const raw = read(env, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new OpenSpecGuardError(
      'E_OPTION',
      `Input ${JSON.stringify(name)} expects a number between ${min} and ${max}, ` +
        `got ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}

function readList(env: Env, name: string): string[] {
  const raw = read(env, name);
  if (raw === undefined) return [];
  return raw
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

export function readConfig(env: Env): ActionConfig {
  // GITHUB_WORKSPACE is where the runner checked the repository out. This is
  // the only place the Action decides a working directory, and it hands it to
  // runCheck as a parameter, exactly like the CLI does.
  const workspace = env.GITHUB_WORKSPACE ?? process.cwd();
  const relative = read(env, 'working-directory');
  const cwd = relative === undefined ? workspace : path.resolve(workspace, relative);

  const runner = read(env, 'runner');
  if (runner !== undefined && !RUNNERS.has(runner as Runner)) {
    throw new OpenSpecGuardError(
      'E_OPTION',
      `Input "runner" expects vitest or jest, got ${JSON.stringify(runner)}.`,
    );
  }

  const failOn = readList(env, 'fail-on');
  for (const verdict of failOn) {
    if (!VERDICTS.has(verdict as Verdict)) {
      throw new OpenSpecGuardError(
        'E_OPTION',
        `Input "fail-on" does not know ${JSON.stringify(verdict)}. ` +
          'Expected some of: pass, uncertain, fail, skip.',
      );
    }
  }

  const format = read(env, 'format') ?? 'terminal';
  if (format !== 'terminal' && format !== 'json') {
    throw new OpenSpecGuardError(
      'E_OPTION',
      `Input "format" expects terminal or json, got ${JSON.stringify(format)}.`,
    );
  }

  const tests = readList(env, 'tests');

  return {
    check: {
      cwd,
      specsPath: read(env, 'specs'),
      codePath: read(env, 'code'),
      testGlobs: tests.length > 0 ? tests : undefined,
      includeChanges: readBoolean(env, 'include-changes', false),
      allowEmpty: readBoolean(env, 'allow-empty', false),
      runner: runner as Runner | undefined,
      requireSelector: readBoolean(env, 'require-selector', false),
      baseline: read(env, 'baseline'),
      updateBaseline: readBoolean(env, 'update-baseline', false),
      failOn: failOn as Verdict[],
      minPass: readNumber(env, 'min-pass', 0, Number.MAX_SAFE_INTEGER) ?? null,
      minCoverage: readNumber(env, 'min-coverage', 0, 100) ?? null,
      passThreshold: readNumber(env, 'pass-threshold', 0, 1),
      uncertainThreshold: readNumber(env, 'uncertain-threshold', 0, 1),
      minSharedTerms: readNumber(env, 'min-shared-terms', 0, 100),
    },
    format,
    annotations: readBoolean(env, 'annotations', true),
    maxAnnotations: readNumber(env, 'max-annotations', 0, 1000) ?? 20,
    summary: readBoolean(env, 'summary', true),
  };
}
