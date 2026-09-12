import { describe, expect, it } from 'vitest';

import type { Criterion, TestTitle } from '../types.js';
import {
  buildTestIndex,
  DEFAULT_MATCH_OPTIONS,
  matchCriterion,
  type MatchOptions,
} from './match.js';

function title(partial: Partial<TestTitle> & { leaf: string }): TestTitle {
  const path = partial.path ?? [partial.leaf];
  return {
    file: 'src/a.test.ts',
    line: 1,
    modifiers: [],
    parameterized: false,
    skipped: false,
    ...partial,
    path,
    fullName: path.join(' > '),
  };
}

function criterion(partial: Partial<Criterion> & { scenario: string }): Criterion {
  return {
    id: 'sg_0000000000000000',
    capability: 'demo',
    requirement: 'R',
    file: 'openspec/specs/demo/spec.md',
    line: 1,
    operation: 'base',
    isNamedScenario: true,
    annotation: null,
    ...partial,
  };
}

function match(
  criterionInput: Criterion,
  titles: TestTitle[],
  options: Partial<MatchOptions> = {},
) {
  return matchCriterion(criterionInput, buildTestIndex(titles), {
    ...DEFAULT_MATCH_OPTIONS,
    ...options,
  });
}

describe('matchCriterion, selectors', () => {
  it('matches a selector against the leaf title', () => {
    const result = match(
      criterion({
        scenario: 'anything',
        annotation: { kind: 'test', selector: 'creates a user', line: 2 },
      }),
      [title({ leaf: 'creates a user' })],
    );
    expect(result.reason).toBe('selector');
    expect(result.best?.score).toBe(1);
  });

  it('matches a selector against the full name', () => {
    const result = match(
      criterion({
        scenario: 'anything',
        annotation: { kind: 'test', selector: 'users > creates a user', line: 2 },
      }),
      [title({ leaf: 'creates a user', path: ['users', 'creates a user'] })],
    );
    expect(result.reason).toBe('selector');
  });

  it('reports a selector that matches nothing', () => {
    const result = match(
      criterion({ scenario: 'x', annotation: { kind: 'test', selector: 'nope', line: 2 } }),
      [title({ leaf: 'creates a user' })],
    );
    expect(result.reason).toBe('selector-unmatched');
    expect(result.best).toBeNull();
  });

  it('reports an ambiguous selector and lists the duplicates', () => {
    const result = match(
      criterion({ scenario: 'x', annotation: { kind: 'test', selector: 'empty field', line: 2 } }),
      [
        title({ leaf: 'empty field', path: ['login', 'empty field'], line: 10 }),
        title({ leaf: 'empty field', path: ['signup', 'empty field'], line: 20 }),
      ],
    );
    expect(result.reason).toBe('selector-ambiguous');
    expect(result.runnersUp).toHaveLength(1);
  });

  it('refuses a selector pointing at a skipped test', () => {
    const result = match(
      criterion({ scenario: 'x', annotation: { kind: 'test', selector: 'a', line: 2 } }),
      [title({ leaf: 'a', skipped: true })],
    );
    expect(result.reason).toBe('matched-test-skipped');
  });

  it('short-circuits on non-testable', () => {
    const result = match(
      criterion({
        scenario: 'legal sign-off',
        annotation: { kind: 'non-testable', reason: 'human review', line: 2 },
      }),
      [title({ leaf: 'legal sign-off' })],
    );
    expect(result.reason).toBe('non-testable');
    expect(result.best).toBeNull();
  });
});

describe('matchCriterion, similarity', () => {
  it('passes at exactly the pass threshold', () => {
    // scenario {creates, user, valid, email} vs leaf {creates, user, valid, email}
    const result = match(criterion({ scenario: 'creates a user with a valid email' }), [
      title({ leaf: 'creates a user with a valid email' }),
    ]);
    expect(result.best?.score).toBe(1);
    expect(result.reason).toBe('heuristic');
  });

  it('lands in the uncertain band on a partial overlap', () => {
    // {rejects, invalid, email} vs {rejects, invalid, address}: 2 shared, 4 union.
    const result = match(criterion({ scenario: 'rejects an invalid email' }), [
      title({ leaf: 'rejects an invalid address' }),
    ]);
    expect(result.best?.score).toBe(0.5);
    expect(result.reason).toBe('heuristic-weak');
  });

  it('falls to low-similarity below the uncertain threshold', () => {
    // {rejects, invalid, email} vs {rejects, blank, name}: 1 shared, 5 union.
    const result = match(criterion({ scenario: 'rejects an invalid email' }), [
      title({ leaf: 'rejects a blank name' }),
    ]);
    expect(result.best?.score).toBe(0.2);
    expect(result.reason).toBe('low-similarity');
  });

  it('rejects a high score carried by a single shared term', () => {
    const result = match(criterion({ scenario: 'payout' }), [title({ leaf: 'payout' })], {
      minSharedTerms: 2,
    });
    expect(result.best?.score).toBe(1);
    expect(result.reason).toBe('heuristic-weak');
  });

  it('honours custom thresholds', () => {
    const titles = [title({ leaf: 'rejects an invalid address' })];
    const scenario = criterion({ scenario: 'rejects an invalid email' });
    expect(match(scenario, titles, { passThreshold: 0.5 }).reason).toBe('heuristic');
    expect(match(scenario, titles, { uncertainThreshold: 0.6 }).reason).toBe('low-similarity');
  });

  it('reports no candidate when nothing is shared at all', () => {
    const result = match(criterion({ scenario: 'Changer la langue' }), [
      title({ leaf: 'falls back to FR for unknown language' }),
    ]);
    expect(result.reason).toBe('no-candidate');
    expect(result.best).toBeNull();
  });

  it('takes the better of leaf and full name, and says which', () => {
    const onLeaf = match(criterion({ scenario: 'rounds under one kilometre' }), [
      title({
        leaf: 'rounds under one kilometre',
        path: ['formatDistance', 'radius', 'rounds under one kilometre'],
      }),
    ]);
    expect(onLeaf.best?.matchedOn).toBe('leaf');

    const onFull = match(criterion({ scenario: 'formatDistance rounds' }), [
      title({ leaf: 'rounds', path: ['formatDistance', 'rounds'] }),
    ]);
    expect(onFull.best?.matchedOn).toBe('fullName');
  });

  it('breaks ties by file then line', () => {
    const result = match(criterion({ scenario: 'creates a user' }), [
      title({ leaf: 'creates a user', file: 'src/b.test.ts', line: 1 }),
      title({ leaf: 'creates a user', file: 'src/a.test.ts', line: 40 }),
      title({ leaf: 'creates a user', file: 'src/a.test.ts', line: 10 }),
    ]);
    expect(result.best).toMatchObject({ file: 'src/a.test.ts', line: 10 });
    expect(result.runnersUp.map((candidate) => candidate.line)).toEqual([40, 1]);
  });

  it('caps runners-up at two', () => {
    const result = match(criterion({ scenario: 'creates a user' }), [
      title({ leaf: 'creates a user', line: 1 }),
      title({ leaf: 'creates a user account', line: 2 }),
      title({ leaf: 'creates a user profile', line: 3 }),
      title({ leaf: 'creates a user session', line: 4 }),
    ]);
    expect(result.runnersUp).toHaveLength(2);
  });

  it('never counts a skipped test as coverage', () => {
    const result = match(criterion({ scenario: 'creates a user with a valid email' }), [
      title({ leaf: 'creates a user with a valid email', skipped: true }),
    ]);
    expect(result.reason).toBe('matched-test-skipped');
  });

  it('disables similarity entirely under --require-selector', () => {
    const result = match(
      criterion({ scenario: 'creates a user with a valid email' }),
      [title({ leaf: 'creates a user with a valid email' })],
      { heuristic: false },
    );
    expect(result.reason).toBe('missing-selector');
    expect(result.best).toBeNull();
  });

  it('still honours a selector under --require-selector', () => {
    const result = match(
      criterion({ scenario: 'x', annotation: { kind: 'test', selector: 'a', line: 2 } }),
      [title({ leaf: 'a' })],
      { heuristic: false },
    );
    expect(result.reason).toBe('selector');
  });
});
