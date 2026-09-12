import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { discover, globToRegExp, toRelativePosix } from './discovery.js';
import { isOpenSpecGuardError } from './errors.js';

const FIXTURES = path.resolve(fileURLToPath(new URL('../tests/fixtures', import.meta.url)));

function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no-error';
  } catch (error) {
    return isOpenSpecGuardError(error) ? error.code : 'not-an-openspec-guard-error';
  }
}

describe('globToRegExp', () => {
  it('matches a brace alternation and an extension list', () => {
    const glob = globToRegExp('**/*.{test,spec}.{ts,tsx}');
    expect(glob.test('src/a.test.ts')).toBe(true);
    expect(glob.test('a.spec.tsx')).toBe(true);
    expect(glob.test('src/deep/nested/a.test.ts')).toBe(true);
    expect(glob.test('src/a.ts')).toBe(false);
  });

  it('does not let a single star cross a directory boundary', () => {
    const glob = globToRegExp('src/*.ts');
    expect(glob.test('src/a.ts')).toBe(true);
    expect(glob.test('src/deep/a.ts')).toBe(false);
  });

  it('escapes regex metacharacters found in a literal path', () => {
    expect(globToRegExp('a+b/c.ts').test('a+b/c.ts')).toBe(true);
    expect(globToRegExp('a+b/c.ts').test('aab/cXts')).toBe(false);
  });
});

describe('discover', () => {
  it('walks the spec root at any depth and derives the capability from the path', async () => {
    const result = await discover({ cwd: fixture('discovery') });
    expect(result.specs.map((spec) => spec.capability)).toEqual(['account/settings', 'account']);
    expect(result.specs.map((spec) => spec.file)).toEqual([
      'openspec/specs/account/settings/spec.md',
      'openspec/specs/account/spec.md',
    ]);
  });

  it('never reads a spec living under an excluded directory', async () => {
    const result = await discover({ cwd: fixture('discovery') });
    expect(result.specs.every((spec) => !spec.file.includes('node_modules'))).toBe(true);
  });

  it('ignores changes by default', async () => {
    const result = await discover({ cwd: fixture('discovery') });
    expect(result.specs.some((spec) => spec.file.includes('/changes/'))).toBe(false);
  });

  it('reads change deltas with --include-changes, but never the archive', async () => {
    const result = await discover({ cwd: fixture('discovery'), includeChanges: true });
    const changes = result.specs.filter((spec) => spec.capability.startsWith('changes/'));
    expect(changes.map((spec) => spec.capability)).toEqual([
      'changes/add-search/specs/discovery/location',
    ]);
    expect(result.specs.some((spec) => spec.file.includes('archive'))).toBe(false);
  });

  it('collects test files by the default globs, pruning build output', async () => {
    const result = await discover({ cwd: fixture('discovery') });
    const relative = result.testFiles.map((file) => toRelativePosix(fixture('discovery'), file));
    expect(relative).toEqual([
      'e2e/journey.spec.ts',
      'src/__tests__/legacy.ts',
      'src/names.test.ts',
    ]);
  });

  it('honours an explicit --tests glob', async () => {
    const result = await discover({
      cwd: fixture('discovery'),
      testGlobs: ['src/**/*.test.ts'],
    });
    const relative = result.testFiles.map((file) => toRelativePosix(fixture('discovery'), file));
    expect(relative).toEqual(['src/names.test.ts']);
  });

  it('refuses a spec root that holds no spec.md', async () => {
    expect(await codeOf(discover({ cwd: fixture('empty-specs') }))).toBe('E_SPECS_EMPTY');
  });

  it('accepts an empty spec root with --allow-empty', async () => {
    const result = await discover({ cwd: fixture('empty-specs'), allowEmpty: true });
    expect(result.specs).toEqual([]);
  });

  it('refuses to guess when both openspec/specs and specs exist', async () => {
    expect(await codeOf(discover({ cwd: fixture('ambiguous-roots') }))).toBe('E_SPECS_AMBIGUOUS');
  });

  it('resolves the ambiguity when --specs is given', async () => {
    const result = await discover({
      cwd: fixture('ambiguous-roots'),
      specsPath: 'specs',
      allowEmpty: true,
    });
    expect(result.specRoot).toBe(path.join(fixture('ambiguous-roots'), 'specs'));
  });

  it('reports a missing spec root', async () => {
    expect(await codeOf(discover({ cwd: fixture('discovery'), specsPath: 'nope' }))).toBe(
      'E_SPECS_NOT_FOUND',
    );
  });

  it('reports a --code path that is not a directory', async () => {
    expect(await codeOf(discover({ cwd: fixture('discovery'), codePath: 'nope' }))).toBe(
      'E_CODE_NOT_FOUND',
    );
  });
});
