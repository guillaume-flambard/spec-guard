import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);

/**
 * The built CLI, executed the way a package manager executes it.
 *
 * `npm`, `pnpm` and `npx` do not run `dist/cli.js`. They run a **symlink** in
 * `node_modules/.bin` that points at it, and that one difference silently
 * disabled this entire command: the entry-point guard compared
 * `import.meta.url` to `process.argv[1]` as strings, the link never equalled
 * its target, `main` never ran, and the process exited 0 with no output at all.
 *
 * These tests run the built file through a symlink on purpose. Nothing shorter
 * would have caught it, and nothing in the unit tests could: they import
 * `main` directly.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'dist', 'cli.js');
const fixture = path.join(here, 'fixtures', 'linked');
const temporaries: string[] = [];

afterEach(async () => {
  await Promise.all(temporaries.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A `node_modules/.bin`-style symlink to the built CLI. */
async function linkedBin(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'aidd-guard-bin-'));
  temporaries.push(dir);
  const link = path.join(dir, 'aidd-guard');
  await symlink(cli, link);
  return link;
}

describe('the built CLI, run through a symlink', () => {
  it('prints its report rather than exiting silently', async () => {
    const bin = await linkedBin();
    const { stdout } = await run(process.execPath, [bin, 'check', '--no-color'], { cwd: fixture });

    expect(stdout).toContain('criteria:');
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  it('answers --version through the symlink too', async () => {
    const bin = await linkedBin();
    const { stdout } = await run(process.execPath, [bin, '--version']);

    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('still carries its exit code through the symlink', async () => {
    const bin = await linkedBin();

    await expect(
      run(process.execPath, [bin, 'check', '--fail-claimed', '--no-color'], { cwd: fixture }),
    ).rejects.toMatchObject({ code: 1 });
  });
});

describe('the built CLI, run by path', () => {
  it('behaves the same as through a symlink', async () => {
    const { stdout } = await run(process.execPath, [cli, 'check', '--no-color'], { cwd: fixture });
    expect(stdout).toContain('criteria:');
  });
});
