import type { MatchReason, Verdict } from './types.js';

/**
 * Reason to verdict, and the gates.
 *
 * One table, tested exhaustively. `skip` is reserved for `non-testable`: a
 * skipped test is never a skipped criterion, it is a failure with a name.
 */

const VERDICTS: Record<MatchReason, Verdict> = {
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

export const ALL_REASONS = Object.keys(VERDICTS) as MatchReason[];

export function decideVerdict(reason: MatchReason): Verdict {
  return VERDICTS[reason];
}

export interface CriterionOutcome {
  verdict: Verdict;
  reason: MatchReason;
  /** The box was ticked. `null` for a Done-when line, which has no box. */
  claimed: boolean | null;
}

export interface Summary {
  total: number;
  pass: number;
  uncertain: number;
  fail: number;
  skip: number;
  /**
   * Percentage of checkable criteria that are linked to a test, one decimal.
   *
   * The denominator excludes `skip`, because a criterion declared non-testable
   * with a reason is a decision that was made, not a gap. A repository with no
   * checkable criterion at all reads 100: there is nothing left to cover.
   */
  coverage: number;
  /** Splits the asserted from the guessed. A pass earned by selector and a
   *  pass earned by similarity are not worth the same thing. */
  passBySelector: number;
  passByHeuristic: number;
  /** Ticked boxes: someone said this was done. */
  claimed: number;
  /**
   * Ticked boxes with nothing behind them.
   *
   * This is the number aidd-guard exists to print. The framework's own rule
   * for its autonomous loop is "never set status: implemented until the
   * success condition genuinely passes". That is an instruction, addressed to a
   * model, checked by nobody. A claim with no test is where that instruction was not
   * followed, and it is countable.
   */
  claimedUnlinked: number;
  failNoCandidate: number;
  failLowSimilarity: number;
  failSelectorUnmatched: number;
  failSelectorAmbiguous: number;
  failSkippedTest: number;
  failMissingSelector: number;
}

export function summarize(outcomes: readonly CriterionOutcome[]): Summary {
  const summary: Summary = {
    total: outcomes.length,
    pass: 0,
    uncertain: 0,
    fail: 0,
    skip: 0,
    coverage: 0,
    passBySelector: 0,
    passByHeuristic: 0,
    claimed: 0,
    claimedUnlinked: 0,
    failNoCandidate: 0,
    failLowSimilarity: 0,
    failSelectorUnmatched: 0,
    failSelectorAmbiguous: 0,
    failSkippedTest: 0,
    failMissingSelector: 0,
  };

  for (const outcome of outcomes) {
    summary[outcome.verdict] += 1;

    if (outcome.claimed === true) {
      summary.claimed += 1;
      // A `skip` is an explicit, reasoned decision, so a claim backed by one is
      // not an unproven claim. Only pass counts as proof.
      if (outcome.verdict !== 'pass' && outcome.verdict !== 'skip') {
        summary.claimedUnlinked += 1;
      }
    }

    switch (outcome.reason) {
      case 'selector':
        summary.passBySelector += 1;
        break;
      case 'heuristic':
        summary.passByHeuristic += 1;
        break;
      case 'no-candidate':
        summary.failNoCandidate += 1;
        break;
      case 'low-similarity':
        summary.failLowSimilarity += 1;
        break;
      case 'selector-unmatched':
        summary.failSelectorUnmatched += 1;
        break;
      case 'selector-ambiguous':
        summary.failSelectorAmbiguous += 1;
        break;
      case 'matched-test-skipped':
        summary.failSkippedTest += 1;
        break;
      case 'missing-selector':
        summary.failMissingSelector += 1;
        break;
      case 'heuristic-weak':
      case 'non-testable':
        break;
    }
  }

  const checkable = summary.total - summary.skip;
  summary.coverage = checkable === 0 ? 100 : Math.round((1000 * summary.pass) / checkable) / 10;

  return summary;
}

export interface Gates {
  /** Verdicts that must not appear. Empty means no gate. */
  failOn: Verdict[];
  /** Minimum number of `pass`. `null` means no gate. */
  minPass: number | null;
  /** Minimum percentage of checkable criteria linked to a test. */
  minCoverage: number | null;
  /** Fail when a ticked box has no test behind it. */
  failClaimed: boolean;
}

export interface GateResult {
  passed: boolean;
  violations: string[];
}

/** Every gate applies, and every violation is reported. */
export function evaluateGates(summary: Summary, gates: Gates): GateResult {
  const violations: string[] = [];

  for (const verdict of gates.failOn) {
    const count = summary[verdict];
    if (count > 0) {
      violations.push(`${count} criteria with verdict '${verdict}', forbidden by --fail-on`);
    }
  }

  if (gates.minPass !== null && summary.pass < gates.minPass) {
    violations.push(`${summary.pass} pass, --min-pass requires at least ${gates.minPass}`);
  }

  if (gates.minCoverage !== null && summary.coverage < gates.minCoverage) {
    violations.push(
      `${summary.coverage}% of checkable criteria are linked, ` +
        `--min-coverage requires at least ${gates.minCoverage}%`,
    );
  }

  if (gates.failClaimed && summary.claimedUnlinked > 0) {
    const many = summary.claimedUnlinked > 1;
    violations.push(
      `${summary.claimedUnlinked} ticked ${many ? 'criteria have' : 'criterion has'} ` +
        'no test behind it, forbidden by --fail-claimed',
    );
  }

  return { passed: violations.length === 0, violations };
}
