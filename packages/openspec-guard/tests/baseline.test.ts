import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_BASELINE_PATH, type BaselineFile } from '../src/baseline.js';
import { runCheck, type CheckInput } from '../src/commands/check.js';
import { EXIT_GATE, EXIT_OK, isOpenSpecGuardError } from '../src/errors.js';

const FIXTURES = path.resolve(fileURLToPath(new URL('./fixtures', import.meta.url)));

const workspaces: string[] = [];

/** A throwaway copy, because these tests write files into the repository. */
async function scratch(fixture: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'openspec-guard-baseline-'));
  await cp(path.join(FIXTURES, fixture), dir, { recursive: true });
  workspaces.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function check(cwd: string, input: Partial<CheckInput> = {}) {
  return runCheck({ cwd, ...input });
}

async function readBaseline(cwd: string): Promise<BaselineFile> {
  return JSON.parse(await readFile(path.join(cwd, DEFAULT_BASELINE_PATH), 'utf8')) as BaselineFile;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no-error';
  } catch (error) {
    return isOpenSpecGuardError(error) ? error.code : 'not-an-openspec-guard-error';
  }
}

describe('--update-baseline', () => {
  it('freezes what is uncovered, and nothing else', async () => {
    const cwd = await scratch('fail-no-candidate');
    const { exitCode, baselineUpdate } = await check(cwd, { updateBaseline: true });

    expect(exitCode).toBe(EXIT_OK);
    expect(baselineUpdate?.total).toBe(1);

    const file = await readBaseline(cwd);
    expect(file.schemaVersion).toBe(1);
    expect(file.entries).toHaveLength(1);
    expect(file.entries[0]).toMatchObject({ reason: 'no-candidate', verdict: 'fail' });
  });

  it('never records a pass or a skip as debt', async () => {
    const cwd = await scratch('pass-explicit');
    await check(cwd, { updateBaseline: true });
    expect((await readBaseline(cwd)).entries).toEqual([]);

    const skipped = await scratch('skip-non-testable');
    await check(skipped, { updateBaseline: true });
    expect((await readBaseline(skipped)).entries).toEqual([]);
  });

  it('exits zero even when a gate would have failed', async () => {
    const cwd = await scratch('fail-no-candidate');
    const { exitCode } = await check(cwd, { updateBaseline: true, failOn: ['fail'] });
    expect(exitCode).toBe(EXIT_OK);
  });

  it('writes the same bytes twice', async () => {
    const cwd = await scratch('corpus');
    await check(cwd, { updateBaseline: true });
    const first = await readFile(path.join(cwd, DEFAULT_BASELINE_PATH), 'utf8');
    await check(cwd, { updateBaseline: true, baseline: DEFAULT_BASELINE_PATH });
    const second = await readFile(path.join(cwd, DEFAULT_BASELINE_PATH), 'utf8');
    expect(first).toBe(second);
  });

  it('carries no clock and no absolute path', async () => {
    const cwd = await scratch('corpus');
    await check(cwd, { updateBaseline: true });
    const raw = await readFile(path.join(cwd, DEFAULT_BASELINE_PATH), 'utf8');
    expect(raw).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(raw).not.toContain(tmpdir());
  });

  it('reports what it added and what it dropped', async () => {
    const cwd = await scratch('corpus');
    const first = await check(cwd, { updateBaseline: true });
    expect(first.baselineUpdate?.diff.added.length).toBeGreaterThan(0);

    const second = await check(cwd, {
      updateBaseline: true,
      baseline: DEFAULT_BASELINE_PATH,
    });
    expect(second.baselineUpdate?.diff).toEqual({ added: [], removed: [] });
  });
});

describe('--baseline', () => {
  it('lets a gate pass on frozen debt', async () => {
    const cwd = await scratch('fail-no-candidate');
    expect((await check(cwd, { failOn: ['fail'] })).exitCode).toBe(EXIT_GATE);

    await check(cwd, { updateBaseline: true });
    const { exitCode, report } = await check(cwd, {
      baseline: DEFAULT_BASELINE_PATH,
      failOn: ['fail'],
    });

    expect(exitCode).toBe(EXIT_OK);
    // The verdict is untouched. Only the gate looks away.
    expect(report.summary.fail).toBe(1);
    expect(report.summary.baselined).toBe(1);
    expect(report.results[0]?.baselined).toBe(true);
    expect(report.options.baseline).toBe(DEFAULT_BASELINE_PATH);
  });

  it('never raises the coverage number', async () => {
    const cwd = await scratch('fail-no-candidate');
    const before = (await check(cwd)).report.summary.coverage;
    await check(cwd, { updateBaseline: true });
    const after = await check(cwd, { baseline: DEFAULT_BASELINE_PATH, failOn: ['fail'] });

    // The gate passes because the debt is frozen. The number does not move,
    // because freezing debt is not covering it.
    expect(after.exitCode).toBe(EXIT_OK);
    expect(after.report.summary.coverage).toBe(before);
    expect(after.report.summary.coverage).toBe(0);

    // And the coverage floor still sees the truth.
    const floored = await check(cwd, {
      baseline: DEFAULT_BASELINE_PATH,
      failOn: ['fail'],
      minCoverage: 50,
    });
    expect(floored.exitCode).toBe(EXIT_GATE);
  });

  it('fails on a scenario added after the freeze', async () => {
    const cwd = await scratch('fail-no-candidate');
    await check(cwd, { updateBaseline: true });

    const spec = path.join(cwd, 'openspec/specs/compte/spec.md');
    await writeFile(
      spec,
      `${await readFile(spec, 'utf8')}\n#### Scenario: Supprimer le compte\n\n- **WHEN** x\n- **THEN** y\n`,
      'utf8',
    );

    const { exitCode, report } = await check(cwd, {
      baseline: DEFAULT_BASELINE_PATH,
      failOn: ['fail'],
    });
    expect(exitCode).toBe(EXIT_GATE);
    expect(report.summary.total).toBe(2);
    expect(report.summary.baselined).toBe(1);
  });

  it('stops suppressing when the failure changes kind', async () => {
    // Frozen as no-candidate. Someone then writes a selector that points at
    // nothing: that is a new mistake, not old debt.
    const cwd = await scratch('fail-no-candidate');
    await check(cwd, { updateBaseline: true });

    const spec = path.join(cwd, 'openspec/specs/compte/spec.md');
    const before = await readFile(spec, 'utf8');
    await writeFile(
      spec,
      before.replace(
        '#### Scenario: Changer la langue du compte\n',
        '#### Scenario: Changer la langue du compte\n<!-- openspec-guard:test="nope" -->\n',
      ),
      'utf8',
    );

    const { exitCode, report } = await check(cwd, {
      baseline: DEFAULT_BASELINE_PATH,
      failOn: ['fail'],
    });
    expect(report.results[0]?.reason).toBe('selector-unmatched');
    expect(report.results[0]?.baselined).toBe(false);
    expect(exitCode).toBe(EXIT_GATE);
  });

  it('stops suppressing when the scenario text is rewritten', async () => {
    const cwd = await scratch('fail-no-candidate');
    await check(cwd, { updateBaseline: true });

    const spec = path.join(cwd, 'openspec/specs/compte/spec.md');
    const before = await readFile(spec, 'utf8');
    await writeFile(spec, before.replace('memorise ce choix', 'memorise ce choix pour toujours'));

    const { report } = await check(cwd, { baseline: DEFAULT_BASELINE_PATH });
    expect(report.results[0]?.baselined).toBe(false);
    expect(report.diagnostics.staleBaselineEntries).toHaveLength(1);
  });

  it('reports an entry that has been fixed, so the file can be pruned', async () => {
    const cwd = await scratch('fail-no-candidate');
    await check(cwd, { updateBaseline: true });

    const spec = path.join(cwd, 'openspec/specs/compte/spec.md');
    const before = await readFile(spec, 'utf8');
    await writeFile(
      spec,
      before.replace(
        '#### Scenario: Changer la langue du compte\n',
        '#### Scenario: Changer la langue du compte\n<!-- openspec-guard:test="falls back to English for an unknown locale" -->\n',
      ),
      'utf8',
    );

    const { report } = await check(cwd, { baseline: DEFAULT_BASELINE_PATH });
    expect(report.results[0]?.verdict).toBe('pass');
    expect(report.summary.baselined).toBe(0);
    expect(report.diagnostics.staleBaselineEntries).toHaveLength(1);
  });

  it('refuses a baseline that does not exist', async () => {
    const cwd = await scratch('fail-no-candidate');
    expect(await codeOf(check(cwd, { baseline: 'nope.json' }))).toBe('E_BASELINE_NOT_FOUND');
  });

  it('refuses a baseline that is not valid JSON', async () => {
    const cwd = await scratch('fail-no-candidate');
    await writeFile(path.join(cwd, DEFAULT_BASELINE_PATH), '{ broken', 'utf8');
    expect(await codeOf(check(cwd, { baseline: DEFAULT_BASELINE_PATH }))).toBe(
      'E_BASELINE_INVALID',
    );
  });

  it('refuses a baseline from another schema version', async () => {
    const cwd = await scratch('fail-no-candidate');
    await writeFile(
      path.join(cwd, DEFAULT_BASELINE_PATH),
      JSON.stringify({ schemaVersion: 99, entries: [] }),
      'utf8',
    );
    expect(await codeOf(check(cwd, { baseline: DEFAULT_BASELINE_PATH }))).toBe(
      'E_BASELINE_INVALID',
    );
  });
});
