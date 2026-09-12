import { describe, expect, it } from 'vitest';

import type { MatchReason, Verdict } from './types.js';
import { ALL_REASONS, decideVerdict, evaluateGates, summarize, type Summary } from './verdict.js';

const EXPECTED: Record<MatchReason, Verdict> = {
  'non-testable': 'skip',
  selector: 'pass',
  heuristic: 'pass',
  'heuristic-weak': 'uncertain',
  'selector-unmatched': 'fail',
  'selector-ambiguous': 'fail',
  'matched-test-skipped': 'fail',
  'low-similarity': 'fail',
  'no-candidate': 'fail',
  'missing-selector': 'fail',
};

describe('decideVerdict', () => {
  // This assertion is the point of the test: it fails the day a reason is
  // added to the enum without a decision being made for it here.
  it('covers every reason, and no more', () => {
    expect([...ALL_REASONS].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [reason, verdict] of Object.entries(EXPECTED) as [MatchReason, Verdict][]) {
    it(`maps ${reason} to ${verdict}`, () => {
      expect(decideVerdict(reason)).toBe(verdict);
    });
  }

  it('reserves skip for non-testable, never for a skipped test', () => {
    expect(decideVerdict('matched-test-skipped')).toBe('fail');
    expect(decideVerdict('non-testable')).toBe('skip');
  });
});

describe('summarize', () => {
  it('counts verdicts and splits pass by how it was earned', () => {
    const summary = summarize([
      { verdict: 'pass', reason: 'selector' },
      { verdict: 'pass', reason: 'selector' },
      { verdict: 'pass', reason: 'heuristic' },
      { verdict: 'uncertain', reason: 'heuristic-weak' },
      { verdict: 'fail', reason: 'no-candidate' },
      { verdict: 'fail', reason: 'low-similarity' },
      { verdict: 'fail', reason: 'selector-unmatched' },
      { verdict: 'fail', reason: 'selector-ambiguous' },
      { verdict: 'fail', reason: 'matched-test-skipped' },
      { verdict: 'fail', reason: 'missing-selector' },
      { verdict: 'skip', reason: 'non-testable' },
    ]);

    expect(summary).toEqual<Summary>({
      total: 11,
      pass: 3,
      uncertain: 1,
      fail: 6,
      skip: 1,
      baselined: 0,
      coverage: 30,
      passBySelector: 2,
      passByHeuristic: 1,
      failNoCandidate: 1,
      failLowSimilarity: 1,
      failSelectorUnmatched: 1,
      failSelectorAmbiguous: 1,
      failSkippedTest: 1,
      failMissingSelector: 1,
    });
  });

  it('counts baselined outcomes without changing their verdict', () => {
    const summary = summarize([
      { verdict: 'fail', reason: 'no-candidate', baselined: true },
      { verdict: 'fail', reason: 'no-candidate' },
    ]);
    expect(summary.fail).toBe(2);
    expect(summary.baselined).toBe(1);
  });

  it('computes coverage over the criteria that can be covered', () => {
    // Three pass, one skip, six fail: the skip leaves the denominator.
    const summary = summarize([
      { verdict: 'pass', reason: 'selector' },
      { verdict: 'pass', reason: 'selector' },
      { verdict: 'pass', reason: 'heuristic' },
      { verdict: 'skip', reason: 'non-testable' },
      ...Array.from({ length: 6 }, () => ({ verdict: 'fail', reason: 'no-candidate' }) as const),
    ]);
    expect(summary.coverage).toBe(33.3);
  });

  it('reads 100 when there is nothing left to cover', () => {
    expect(summarize([{ verdict: 'skip', reason: 'non-testable' }]).coverage).toBe(100);
    expect(summarize([]).coverage).toBe(100);
  });

  it('does not count an uncertain criterion as covered', () => {
    const summary = summarize([
      { verdict: 'pass', reason: 'selector' },
      { verdict: 'uncertain', reason: 'heuristic-weak' },
    ]);
    expect(summary.coverage).toBe(50);
  });

  it('always has passBySelector plus passByHeuristic equal to pass', () => {
    const summary = summarize([
      { verdict: 'pass', reason: 'selector' },
      { verdict: 'pass', reason: 'heuristic' },
    ]);
    expect(summary.passBySelector + summary.passByHeuristic).toBe(summary.pass);
  });
});

function summaryOf(partial: Partial<Summary>): Summary {
  return { ...summarize([]), ...partial };
}

describe('evaluateGates', () => {
  it('passes when no gate is set', () => {
    expect(
      evaluateGates(summaryOf({ fail: 5 }), { failOn: [], minPass: null, minCoverage: null }),
    ).toEqual({
      passed: true,
      violations: [],
    });
  });

  it('fails on a forbidden verdict', () => {
    const result = evaluateGates(summaryOf({ fail: 3 }), {
      failOn: ['fail'],
      minPass: null,
      minCoverage: null,
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(["3 criteria with verdict 'fail', forbidden by --fail-on"]);
  });

  it('ignores a forbidden verdict that does not occur', () => {
    expect(
      evaluateGates(summaryOf({ fail: 0, uncertain: 0 }), {
        failOn: ['fail', 'uncertain'],
        minPass: null,
        minCoverage: null,
      }).passed,
    ).toBe(true);
  });

  it('fails when min-pass is not reached', () => {
    const result = evaluateGates(summaryOf({ pass: 4 }), {
      failOn: [],
      minPass: 5,
      minCoverage: null,
    });
    expect(result.violations).toEqual(['4 pass, --min-pass requires at least 5']);
  });

  it('fails when coverage is below the floor', () => {
    const result = evaluateGates(summaryOf({ coverage: 42.5 }), {
      failOn: [],
      minPass: null,
      minCoverage: 80,
    });
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('42.5%');
    expect(result.violations[0]).toContain('at least 80%');
  });

  it('reads coverage on the whole repository, so a baseline never raises it', () => {
    // What the baseline does not hide reads 100%: every remaining criterion
    // passes. The repository still reads 20%, and that is the number the floor
    // is measured against.
    const notBaselined = summaryOf({ pass: 1, total: 1, coverage: 100 });
    const overall = summaryOf({ pass: 1, total: 5, fail: 4, coverage: 20 });
    const result = evaluateGates(
      notBaselined,
      { failOn: ['fail'], minPass: null, minCoverage: 80 },
      overall,
    );
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual([
      '20% of checkable criteria are linked, --min-coverage requires at least 80%',
    ]);
  });

  it('reports both violations when both gates are broken', () => {
    const result = evaluateGates(summaryOf({ pass: 1, fail: 2 }), {
      failOn: ['fail'],
      minPass: 5,
      minCoverage: null,
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});
