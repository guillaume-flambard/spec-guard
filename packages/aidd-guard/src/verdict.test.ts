import { describe, expect, it } from 'vitest';

import type { MatchReason } from './types.js';
import {
  ALL_REASONS,
  decideVerdict,
  evaluateGates,
  summarize,
  type CriterionOutcome,
} from './verdict.js';

const outcome = (reason: MatchReason, claimed: boolean | null = null): CriterionOutcome => ({
  reason,
  verdict: decideVerdict(reason),
  claimed,
});

describe('the verdict table', () => {
  it('decides every reason', () => {
    for (const reason of ALL_REASONS) {
      expect(decideVerdict(reason)).toMatch(/^(pass|uncertain|fail|skip)$/);
    }
  });

  it('passes only what a selector or a strong similarity earned', () => {
    const passing = ALL_REASONS.filter((reason) => decideVerdict(reason) === 'pass');
    expect(passing.sort()).toEqual(['heuristic', 'selector']);
  });

  it('never reads a skipped test as coverage', () => {
    expect(decideVerdict('matched-test-skipped')).toBe('fail');
  });

  it('skips only what was declared non-testable with a reason', () => {
    const skipping = ALL_REASONS.filter((reason) => decideVerdict(reason) === 'skip');
    expect(skipping).toEqual(['non-testable']);
  });
});

describe('the summary', () => {
  it('splits a pass earned by selector from one earned by similarity', () => {
    const summary = summarize([outcome('selector'), outcome('heuristic'), outcome('selector')]);

    expect(summary.pass).toBe(3);
    expect(summary.passBySelector).toBe(2);
    expect(summary.passByHeuristic).toBe(1);
  });

  it('excludes declared non-testable criteria from coverage', () => {
    const summary = summarize([outcome('selector'), outcome('non-testable')]);
    expect(summary.coverage).toBe(100);
  });

  it('reads a repository with nothing checkable as fully covered', () => {
    expect(summarize([outcome('non-testable')]).coverage).toBe(100);
    expect(summarize([]).coverage).toBe(100);
  });

  it('counts a ticked box with no test behind it', () => {
    const summary = summarize([
      outcome('no-candidate', true),
      outcome('heuristic-weak', true),
      outcome('selector', true),
      outcome('no-candidate', false),
      outcome('no-candidate', null),
    ]);

    expect(summary.claimed).toBe(3);
    expect(summary.claimedUnlinked).toBe(2);
  });

  it('does not call a reasoned non-testable claim unproven', () => {
    const summary = summarize([outcome('non-testable', true)]);

    expect(summary.claimed).toBe(1);
    expect(summary.claimedUnlinked).toBe(0);
  });
});

describe('the gates', () => {
  const base = { failOn: [], minPass: null, minCoverage: null, failClaimed: false };

  it('passes when nothing is asked', () => {
    expect(evaluateGates(summarize([outcome('no-candidate')]), base).passed).toBe(true);
  });

  it('reports every violation, not the first', () => {
    const summary = summarize([outcome('no-candidate'), outcome('heuristic-weak')]);
    const result = evaluateGates(summary, {
      ...base,
      failOn: ['fail', 'uncertain'],
      minPass: 1,
    });

    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(3);
  });

  it('fails a ticked box with no test under --fail-claimed', () => {
    const summary = summarize([outcome('no-candidate', true)]);
    const result = evaluateGates(summary, { ...base, failClaimed: true });

    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('ticked criterion has no test behind it');
  });

  it('says "criteria have" when more than one claim is unproven', () => {
    const summary = summarize([outcome('no-candidate', true), outcome('low-similarity', true)]);
    const result = evaluateGates(summary, { ...base, failClaimed: true });

    expect(result.violations[0]).toContain('2 ticked criteria have no test behind it');
  });

  it('leaves --fail-claimed silent when every claim is proven', () => {
    const summary = summarize([outcome('selector', true)]);
    expect(evaluateGates(summary, { ...base, failClaimed: true }).passed).toBe(true);
  });

  it('measures coverage against the whole repository', () => {
    const summary = summarize([outcome('selector'), outcome('no-candidate')]);
    const result = evaluateGates(summary, { ...base, minCoverage: 80 });

    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('50%');
  });
});
