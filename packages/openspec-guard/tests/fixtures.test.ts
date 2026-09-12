import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const FIXTURES = path.resolve(fileURLToPath(new URL('./fixtures', import.meta.url)));

async function walk(root: string): Promise<{ files: string[]; symlinks: string[] }> {
  const files: string[] = [];
  const symlinks: string[] = [];

  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        symlinks.push(absolute);
        continue;
      }
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };

  await visit(root);
  return { files, symlinks };
}

/**
 * The fixtures are the frozen input SpecGuard is tested against. They must be
 * entirely self-contained: nothing reaches outside this directory, and nothing
 * inside it mentions a path that exists only on one machine. Without this
 * guard, a fixture can quietly start depending on a neighbouring repository
 * and the suite stops being reproducible.
 */
describe('tests/fixtures', () => {
  it('contains no symlink, so nothing reaches outside the directory', async () => {
    const { symlinks } = await walk(FIXTURES);
    expect(symlinks).toEqual([]);
  });

  it('mentions no absolute path, so it does not depend on this machine', async () => {
    const { files } = await walk(FIXTURES);
    const offenders: string[] = [];

    for (const file of files) {
      if ((await lstat(file)).size === 0) continue;
      const content = await readFile(file, 'utf8');
      if (/(^|[\s"'`(])(\/Users\/|\/home\/|[A-Za-z]:\\\\)/m.test(content)) {
        offenders.push(path.relative(FIXTURES, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('holds at least the fixtures the suites rely on', async () => {
    const entries = (await readdir(FIXTURES, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(entries).toEqual([
      'ambiguous-roots',
      'bad-annotation',
      'corpus',
      'discovery',
      'dynamic-titles',
      'empty-specs',
      'fail-low-similarity',
      'fail-no-candidate',
      'fail-selector-ambiguous',
      'fail-selector-broken',
      'pass-explicit',
      'pass-heuristic',
      'skip-non-testable',
      'skipped-test',
      'uncertain',
    ]);
  });
});
