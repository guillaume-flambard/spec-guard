import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AnnotationErrors, runCheck, type CheckInput } from '../src/commands/check.js';
import { EXIT_GATE, EXIT_OK } from '../src/errors.js';
import { renderJson } from '../src/report/json.js';
import type { CriterionResult, Report } from '../src/report/types.js';

const FIXTURES = path.resolve(fileURLToPath(new URL('./fixtures', import.meta.url)));

async function check(name: string, input: Partial<CheckInput> = {}) {
  return runCheck({ cwd: path.join(FIXTURES, name), ...input });
}

function only(report: Report): CriterionResult {
  expect(report.results).toHaveLength(1);
  return report.results[0] as CriterionResult;
}

describe('runCheck, one verdict per fixture', () => {
  it('passes on an explicit selector', async () => {
    const { report, exitCode } = await check('pass-explicit');
    expect(only(report)).toMatchObject({ verdict: 'pass', reason: 'selector' });
    expect(only(report).match.test?.fullName).toBe('email > rejects an invalid email address');
    expect(exitCode).toBe(EXIT_OK);
  });

  it('passes on a strong similarity', async () => {
    const { report } = await check('pass-heuristic');
    expect(only(report)).toMatchObject({ verdict: 'pass', reason: 'heuristic' });
    expect(only(report).match.score).toBe(0.75);
  });

  it('is uncertain in the middle band', async () => {
    const { report } = await check('uncertain');
    expect(only(report)).toMatchObject({ verdict: 'uncertain', reason: 'heuristic-weak' });
  });

  it('fails with no candidate when the languages differ', async () => {
    const { report } = await check('fail-no-candidate');
    expect(only(report)).toMatchObject({ verdict: 'fail', reason: 'no-candidate' });
    expect(only(report).match.test).toBeNull();
  });

  it('fails on a candidate that is too weak, and still names it', async () => {
    const { report } = await check('fail-low-similarity');
    const result = only(report);
    expect(result).toMatchObject({ verdict: 'fail', reason: 'low-similarity' });
    expect(result.match.test?.fullName).toBe('rejects a blank name');
    expect(result.match.sharedTerms).toEqual(['rejects']);
  });

  it('fails on a selector that matches nothing', async () => {
    const { report } = await check('fail-selector-broken');
    expect(only(report)).toMatchObject({
      verdict: 'fail',
      reason: 'selector-unmatched',
      selector: 'rejects an invalid e-mail',
    });
  });

  it('fails on an ambiguous selector and lists the duplicates', async () => {
    const { report } = await check('fail-selector-ambiguous');
    const result = only(report);
    expect(result.reason).toBe('selector-ambiguous');
    expect(result.match.runnersUp).toHaveLength(1);
  });

  it('skips a non-testable scenario and keeps its reason', async () => {
    const { report } = await check('skip-non-testable');
    expect(only(report)).toMatchObject({
      verdict: 'skip',
      reason: 'non-testable',
      nonTestableReason: 'Requires a human legal assessment',
    });
  });

  it('never counts a skipped test as coverage', async () => {
    const { report } = await check('skipped-test');
    expect(only(report)).toMatchObject({ verdict: 'fail', reason: 'matched-test-skipped' });
    expect(only(report).match.test?.skipped).toBe(true);
  });

  it('reports dynamic titles instead of guessing them', async () => {
    const { report } = await check('dynamic-titles');
    expect(report.input.testTitleCount).toBe(0);
    expect(report.diagnostics.dynamicTitles).toHaveLength(3);
    expect(only(report).reason).toBe('no-candidate');
  });
});

describe('runCheck, configuration errors', () => {
  it('collects every annotation error and refuses to report', async () => {
    await expect(check('bad-annotation')).rejects.toBeInstanceOf(AnnotationErrors);
    const error = await check('bad-annotation').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AnnotationErrors);
    expect((error as AnnotationErrors).errors.map((entry) => entry.code)).toEqual([
      'E_ANNOTATION_CONFLICT',
      'E_ANNOTATION_SYNTAX',
    ]);
  });
});

describe('runCheck, gates', () => {
  it('exits zero by default even with failures', async () => {
    const { exitCode, report } = await check('fail-no-candidate');
    expect(report.summary.fail).toBe(1);
    expect(exitCode).toBe(EXIT_OK);
  });

  it('fails the gate on a forbidden verdict', async () => {
    const { exitCode, report } = await check('fail-no-candidate', { failOn: ['fail'] });
    expect(exitCode).toBe(EXIT_GATE);
    expect(report.gates.violations).toHaveLength(1);
  });

  it('fails the gate on min-pass', async () => {
    const { exitCode } = await check('pass-explicit', { minPass: 2 });
    expect(exitCode).toBe(EXIT_GATE);
  });

  it('reports both violations when both gates break', async () => {
    const { report } = await check('fail-no-candidate', { failOn: ['fail'], minPass: 1 });
    expect(report.gates.violations).toHaveLength(2);
  });

  it('fails the gate on a coverage floor', async () => {
    expect((await check('pass-explicit', { minCoverage: 100 })).exitCode).toBe(EXIT_OK);
    expect((await check('fail-no-candidate', { minCoverage: 50 })).exitCode).toBe(EXIT_GATE);
  });

  it('leaves a non-testable scenario out of the coverage denominator', async () => {
    const { report, exitCode } = await check('skip-non-testable', { minCoverage: 100 });
    // One criterion, declared non-testable: nothing is left to cover.
    expect(report.summary.coverage).toBe(100);
    expect(exitCode).toBe(EXIT_OK);
  });

  it('treats uncertain as passing unless it is named in --fail-on', async () => {
    expect((await check('uncertain')).exitCode).toBe(EXIT_OK);
    expect((await check('uncertain', { failOn: ['fail', 'uncertain'] })).exitCode).toBe(EXIT_GATE);
  });
});

describe('runCheck on the corpus', () => {
  it('reads every base spec, and no change spec by default', async () => {
    const { report } = await check('corpus');
    expect(report.input.specFileCount).toBe(2);
    expect(report.summary.total).toBe(5);
    expect(report.input.removedScenarioCount).toBe(0);
  });

  it('reads change deltas on demand, and never the removed ones', async () => {
    const { report } = await check('corpus', { includeChanges: true });
    expect(report.input.specFileCount).toBe(5);
    // Three base scenarios plus two settings scenarios, plus one ADDED and one
    // RENAMED delta scenario. The REMOVED one is counted, never checked.
    expect(report.summary.total).toBe(7);
    expect(report.input.removedScenarioCount).toBe(1);
  });

  it('gives distinct ids to two scenarios sharing a title in one file', async () => {
    const { report } = await check('corpus');
    const anonymous = report.results.filter((result) => result.scenario === 'Visiteur anonyme');
    expect(anonymous).toHaveLength(2);
    expect(new Set(anonymous.map((result) => result.id)).size).toBe(2);
  });

  it('separates asserted passes from guessed ones', async () => {
    const { report } = await check('corpus');
    expect(report.summary.passBySelector).toBe(1);
    expect(report.summary.passByHeuristic).toBe(0);
    expect(report.summary.passBySelector + report.summary.passByHeuristic).toBe(
      report.summary.pass,
    );
  });

  it('sorts results by file, then line, then id', async () => {
    const { report } = await check('corpus');
    const keys = report.results.map((result) => [result.source.file, result.source.line] as const);
    const sorted = [...keys].sort((left, right) =>
      left[0] === right[0] ? left[1] - right[1] : left[0] < right[0] ? -1 : 1,
    );
    expect(keys).toEqual(sorted);
  });

  it('produces identical bytes on two consecutive runs', async () => {
    const first = renderJson((await check('corpus', { includeChanges: true })).report);
    const second = renderJson((await check('corpus', { includeChanges: true })).report);
    expect(first).toBe(second);
  });
});
