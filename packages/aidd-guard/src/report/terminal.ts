import type { MatchReason } from '../types.js';

import type { CriterionResult, Report } from './types.js';

/**
 * The terminal report.
 *
 * Two rules decide everything printed here:
 *
 *  - **the asserted and the guessed never share a number.** A pass earned by a
 *    selector is a fact; a pass earned by word overlap is a guess that happened
 *    to be good. They are counted apart, always;
 *  - **a ticked box with no test is printed first.** Everything else in this
 *    report is a gap; that one is a contradiction, and it is the reason the
 *    tool exists.
 *
 * No colour when the stream is not a TTY, and no spinner ever: the output is
 * read in CI logs far more often than by a human.
 */

const GLYPH: Record<string, string> = {
  pass: '+',
  uncertain: '?',
  fail: '-',
  skip: '.',
};

const EXPLANATION: Record<MatchReason, string> = {
  selector: 'linked by selector',
  heuristic: 'matched by similarity',
  'heuristic-weak': 'weak similarity, confirm or link it',
  'selector-unmatched': 'selector names a test that does not exist',
  'selector-ambiguous': 'selector matches more than one test',
  'matched-test-skipped': 'the only matching test is skipped',
  'low-similarity': 'no test close enough',
  'no-candidate': 'no test shares a significant word',
  'missing-selector': 'no selector, and --require-selector is on',
  'non-testable': 'declared non-testable',
};

export interface TerminalOptions {
  /** `--verbose`: list every criterion, not only the ones that need an action. */
  verbose: boolean;
  colour: boolean;
}

function paint(text: string, code: number, colour: boolean): string {
  return colour ? `[${code}m${text}[0m` : text;
}

function truncate(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, width - 1)}…`;
}

function line(result: CriterionResult, options: TerminalOptions): string {
  const glyph = GLYPH[result.verdict] ?? '?';
  const colour =
    result.verdict === 'pass'
      ? 32
      : result.verdict === 'fail'
        ? 31
        : result.verdict === 'uncertain'
          ? 33
          : 90;
  const claim = result.claimed === true ? paint(' [ticked]', 35, options.colour) : '';
  const where = `${result.location.file}:${result.location.line}`;
  const why = EXPLANATION[result.reason];
  const evidence =
    result.match.test && result.reason !== 'non-testable'
      ? `\n      ${paint('→', 90, options.colour)} ${truncate(result.match.test.fullName, 68)}` +
        ` (${result.match.score})`
      : '';

  return (
    `  ${paint(glyph, colour, options.colour)} ${truncate(result.text, 72)}${claim}\n` +
    `      ${paint(where, 90, options.colour)} · ${paint(why, 90, options.colour)}${evidence}`
  );
}

export function renderTerminal(report: Report, options: TerminalOptions): string {
  const { summary, input } = report;
  const out: string[] = [];

  out.push(
    `aidd-guard ${report.tool.version} · ${input.tasksRoot} · ` +
      `${input.documentCount} documents · ${input.testTitleCount} test titles (${input.runner})`,
  );
  out.push('');

  if (summary.claimedUnlinked > 0) {
    const many = summary.claimedUnlinked > 1;
    out.push(
      paint(
        `${summary.claimedUnlinked} ticked ${many ? 'criteria have' : 'criterion has'} ` +
          'no test behind it.',
        options.colour ? 35 : 0,
        options.colour,
      ),
    );
    out.push('');
  }

  const shown = report.results.filter(
    (result) => options.verbose || (result.verdict !== 'pass' && result.verdict !== 'skip'),
  );

  // A ticked box that proves nothing is the first thing anyone should read.
  const ordered = [...shown].sort((left, right) => {
    const leftClaim = left.claimed === true && left.verdict !== 'pass' ? 0 : 1;
    const rightClaim = right.claimed === true && right.verdict !== 'pass' ? 0 : 1;
    return leftClaim - rightClaim;
  });

  for (const result of ordered) out.push(line(result, options));
  if (ordered.length > 0) out.push('');

  const passes =
    `${summary.pass} pass (${summary.passBySelector} by selector, ` +
    `${summary.passByHeuristic} by similarity)`;
  out.push(
    `${summary.total} criteria: ${passes}, ${summary.uncertain} uncertain, ` +
      `${summary.fail} fail, ${summary.skip} skip · ${summary.coverage}% linked`,
  );

  if (summary.claimed > 0) {
    out.push(
      `${summary.claimed} ticked, of which ${summary.claimedUnlinked} unproven ` + `by any test.`,
    );
  }

  if (report.gates.violations.length > 0) {
    out.push('');
    for (const violation of report.gates.violations) {
      out.push(paint(`gate: ${violation}`, 31, options.colour));
    }
  }

  return `${out.join('\n')}\n`;
}
