import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = path.join(ROOT, 'dist', 'cli.js');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Deliberately a subprocess, and deliberately few: this covers exactly what
 * calling `runCheck` directly cannot prove. The shebang, the real exit code,
 * and the fact that stdout carries the JSON document and nothing else.
 */
async function cli(...args: string[]): Promise<Run> {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd: ROOT });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? -1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

beforeAll(async () => {
  // The subprocess runs the built artifact, not the sources.
  await run('pnpm', ['build'], { cwd: ROOT, shell: process.platform === 'win32' });
}, 120_000);

describe('openspec-guard CLI', () => {
  it('prints help and exits zero', async () => {
    const result = await cli('--help');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('openspec-guard check [options]');
  });

  it('prints the version and exits zero', async () => {
    const result = await cli('--version');
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exits zero on a clean run', async () => {
    const result = await cli('check', '--cwd', fixture('pass-explicit'));
    expect(result.code).toBe(0);
  });

  it('puts the JSON document on stdout and nothing else', async () => {
    const result = await cli('check', '--cwd', fixture('pass-explicit'), '--format', 'json');
    expect(result.code).toBe(0);
    const parsed: unknown = JSON.parse(result.stdout);
    expect((parsed as { schemaVersion: number }).schemaVersion).toBe(1);
    expect(result.stdout.startsWith('{')).toBe(true);
  });

  it('exits 1, and only 1, when a gate is violated', async () => {
    const result = await cli('check', '--cwd', fixture('fail-no-candidate'), '--fail-on', 'fail');
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('gate:');
  });

  it('exits 2 on an unknown option', async () => {
    const result = await cli('check', '--nope');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('nope');
  });

  it('exits 2 on an unknown command', async () => {
    const result = await cli('inspect');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Known commands: check, link.');
  });

  it('exits 2 on an out-of-range threshold', async () => {
    const result = await cli('check', '--pass-threshold', '4');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--pass-threshold');
  });

  it('exits 2 on an unknown --order', async () => {
    const result = await cli('link', '--order', 'random');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--order');
  });

  it('exits 2 on an unknown --fail-on verdict', async () => {
    const result = await cli('check', '--fail-on', 'broken');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--fail-on');
  });

  it('exits 2 on a spec root holding no spec', async () => {
    const result = await cli('check', '--cwd', fixture('empty-specs'));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('E_SPECS_EMPTY');
  });

  it('exits 2 and lists every annotation error at once', async () => {
    const result = await cli('check', '--cwd', fixture('bad-annotation'));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('E_ANNOTATION_CONFLICT');
    expect(result.stderr).toContain('E_ANNOTATION_SYNTAX');
    expect(result.stderr).toContain('Nothing was checked.');
  });

  it('refuses a baseline that does not exist, with exit 2', async () => {
    const result = await cli('check', '--cwd', fixture('pass-explicit'), '--baseline', 'nope.json');
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('E_BASELINE_NOT_FOUND');
  });

  it('announces a baseline write on stderr, keeping stdout clean', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'openspec-guard-cli-'));
    try {
      await cp(fixture('fail-no-candidate'), workspace, { recursive: true });
      const result = await cli(
        'check',
        '--cwd',
        workspace,
        '--update-baseline',
        '--format',
        'json',
      );
      expect(result.code).toBe(0);
      expect(result.stderr).toContain('Baseline written to');
      // stdout still holds the document, and only the document.
      expect(JSON.parse(result.stdout)).toHaveProperty('schemaVersion', 1);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('refuses to run link without a terminal, and says what to do instead', async () => {
    const result = await cli('link', '--cwd', fixture('pass-heuristic'));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('link needs a terminal');
    expect(result.stderr).toContain('--update-baseline');
  });

  it('emits no colour when stdout is a pipe', async () => {
    const result = await cli('check', '--cwd', fixture('pass-heuristic'));
    // eslint-disable-next-line no-control-regex
    expect(result.stdout).not.toMatch(/\u001B\[/);
  });
});
