import { describe, expect, it } from 'vitest';

import type { Manifest } from '../discovery.js';
import { isOpenSpecGuardError } from '../errors.js';
import { detectRunner } from './detect.js';

function manifest(json: Record<string, unknown>, file = 'package.json'): Manifest {
  return { file, json };
}

function codeOf(run: () => unknown): string {
  try {
    run();
    return 'no-error';
  } catch (error) {
    return isOpenSpecGuardError(error) ? error.code : 'not-an-openspec-guard-error';
  }
}

describe('detectRunner', () => {
  it('reads vitest from devDependencies', () => {
    const result = detectRunner([manifest({ devDependencies: { vitest: '^3' } })], []);
    expect(result.runner).toBe('vitest');
    expect(result.evidence).toEqual(['package.json#devDependencies.vitest']);
  });

  it('reads jest from a script', () => {
    const result = detectRunner([manifest({ scripts: { test: 'jest --ci' } })], []);
    expect(result.runner).toBe('jest');
    expect(result.evidence).toEqual(['package.json#scripts.test']);
  });

  it('reads jest from the jest key of the manifest', () => {
    expect(detectRunner([manifest({ jest: { testEnvironment: 'node' } })], []).runner).toBe('jest');
  });

  it('accepts a config file as evidence, without evaluating it', () => {
    const result = detectRunner([], ['packages/web/vitest.config.ts']);
    expect(result.runner).toBe('vitest');
    expect(result.evidence).toEqual(['packages/web/vitest.config.ts']);
  });

  it('does not mistake a substring for a dependency', () => {
    expect(
      codeOf(() => detectRunner([manifest({ devDependencies: { 'jest-diff': '^29' } })], [])),
    ).toBe('E_RUNNER_NOT_FOUND');
  });

  it('picks the runner with more evidence in a mixed repository, and lists it all', () => {
    const result = detectRunner(
      [
        manifest({ devDependencies: { vitest: '^3' } }, 'apps/web/package.json'),
        manifest({ devDependencies: { jest: '^29' } }, 'packages/domain/package.json'),
        manifest({ scripts: { test: 'jest' } }, 'packages/domain/package.json'),
      ],
      [],
    );
    expect(result.runner).toBe('jest');
    expect(result.evidence).toHaveLength(3);
  });

  it('fails clearly when no runner is visible at all', () => {
    expect(codeOf(() => detectRunner([manifest({})], []))).toBe('E_RUNNER_NOT_FOUND');
  });

  it('short-circuits on --runner and says so in the evidence', () => {
    expect(detectRunner([], [], 'jest')).toEqual({ runner: 'jest', evidence: ['--runner jest'] });
  });
});
