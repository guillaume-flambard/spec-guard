import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runCheck } from '../src/commands/check.js';
import { EXIT_GATE, EXIT_OK } from '../src/errors.js';
import type { CriterionResult } from '../src/report/types.js';

/**
 * End to end, on a fixture repository that is a real repository: a task folder,
 * a `package.json`, a test file. Every verdict below is pinned on purpose. A
 * change of behaviour has to be argued for here before it ships.
 */

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const linked = path.join(fixtures, 'linked');

const find = (results: readonly CriterionResult[], fragment: string): CriterionResult => {
  const result = results.find((candidate) => candidate.text.includes(fragment));
  if (!result) throw new Error(`no criterion containing ${JSON.stringify(fragment)}`);
  return result;
};

describe('a repository that uses selectors', () => {
  it('reads both carriers and reports one criterion per line', async () => {
    const { report } = await runCheck({ cwd: linked });

    expect(report.input.documentCount).toBe(2);
    expect(report.input.runner).toBe('vitest');
    // 5 Done-when lines, 2 checkboxes, and the placeholder is not a criterion.
    expect(report.summary.total).toBe(7);
  });

  it('passes a criterion linked by a leaf selector', async () => {
    const { report } = await runCheck({ cwd: linked });
    const result = find(report.results, 'produces a JSON file');

    expect(result.verdict).toBe('pass');
    expect(result.reason).toBe('selector');
    expect(result.match.test?.fullName).toBe('export > writes the export as JSON');
  });

  it('passes a criterion linked by a full name selector', async () => {
    const { report } = await runCheck({ cwd: linked });
    expect(find(report.results, 'anonymous visitor').reason).toBe('selector');
  });

  it('skips a criterion declared non-testable, and keeps the reason', async () => {
    const { report } = await runCheck({ cwd: linked });
    const result = find(report.results, 'legal retention notice');

    expect(result.verdict).toBe('skip');
    expect(result.nonTestableReason).toBe('Requires a human legal assessment');
  });

  it('never reads a skipped test as coverage', async () => {
    const { report } = await runCheck({ cwd: linked });
    const result = find(report.results, 'The export streams rows');

    expect(result.match.test?.skipped).toBe(true);
    expect(result.verdict).toBe('fail');
    expect(result.reason).toBe('matched-test-skipped');
  });

  it('joins a wrapped criterion and scores it on the whole sentence', async () => {
    const { report } = await runCheck({ cwd: linked });
    const result = find(report.results, 'thirty thousand row');

    expect(result.text).toBe(
      'A large account streams rows instead of buffering them, so a thirty thousand row ' +
        'account behaves like a small one.',
    );
    // The best candidate is there but too far to assert coverage on: that band
    // is a work queue, not a pass.
    expect(result.verdict).toBe('uncertain');
  });

  it('fails a criterion that shares no word with any test', async () => {
    const { report } = await runCheck({ cwd: linked });
    const result = find(report.results, 'shares any word');

    expect(result.verdict).toBe('fail');
    expect(result.reason).toBe('no-candidate');
  });

  it('carries the ticked state of a checkbox', async () => {
    const { report } = await runCheck({ cwd: linked });

    expect(find(report.results, 'streams rows').claimed).toBe(true);
    expect(find(report.results, 'carries no session').claimed).toBe(false);
    expect(find(report.results, 'produces a JSON file').claimed).toBeNull();
  });

  it('counts a ticked box with no test behind it', async () => {
    const { report } = await runCheck({ cwd: linked });

    expect(report.summary.claimed).toBe(1);
    expect(report.summary.claimedUnlinked).toBe(1);
  });
});

describe('gates', () => {
  it('exits 0 when nothing is asked', async () => {
    expect((await runCheck({ cwd: linked })).exitCode).toBe(EXIT_OK);
  });

  it('exits 1 on --fail-claimed when a claim proves nothing', async () => {
    const { exitCode, report } = await runCheck({ cwd: linked, failClaimed: true });

    expect(exitCode).toBe(EXIT_GATE);
    expect(report.gates.violations[0]).toContain('ticked criterion has no test behind it');
  });

  it('exits 1 when --fail-on names a verdict that occurred', async () => {
    const { exitCode } = await runCheck({ cwd: linked, failOn: ['fail'] });
    expect(exitCode).toBe(EXIT_GATE);
  });

  it('fails every criterion without a selector under --require-selector', async () => {
    const { report } = await runCheck({ cwd: linked, requireSelector: true });

    expect(report.summary.failMissingSelector).toBe(4);
    expect(report.summary.pass).toBe(2);
  });
});

describe('the report is a contract', () => {
  it('produces identical bytes for two identical runs', async () => {
    const first = await runCheck({ cwd: linked });
    const second = await runCheck({ cwd: linked });

    expect(JSON.stringify(first.report)).toBe(JSON.stringify(second.report));
  });

  it('holds no absolute path', async () => {
    const { report } = await runCheck({ cwd: linked });
    expect(JSON.stringify(report)).not.toContain(linked);
  });

  it('sorts results by file, then line', async () => {
    const { report } = await runCheck({ cwd: linked });
    const keys = report.results.map((result) => `${result.location.file}:${result.location.line}`);

    expect(keys).toEqual([...keys].sort((left, right) => (left < right ? -1 : 1)));
  });
});

describe('refusals', () => {
  it('refuses a repository with no task directory', async () => {
    await expect(runCheck({ cwd: fixtures })).rejects.toMatchObject({
      code: 'E_TASKS_NOT_FOUND',
      exitCode: 2,
    });
  });

  it('refuses a task root holding no document, which would report a false success', async () => {
    await expect(runCheck({ cwd: path.join(fixtures, 'empty') })).rejects.toMatchObject({
      code: 'E_TASKS_EMPTY',
    });
  });

  it('allows an empty task root when asked explicitly', async () => {
    const { report } = await runCheck({ cwd: path.join(fixtures, 'empty'), allowEmpty: true });
    expect(report.summary.total).toBe(0);
  });
});
