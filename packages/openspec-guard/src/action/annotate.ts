import type { CriterionResult, Report } from '../report/types.js';

/**
 * Turning a report into what a reviewer sees on a pull request.
 *
 * Two surfaces, both pure functions of the report so both are testable:
 * workflow commands, which GitHub renders as annotations on the changed files,
 * and a job summary, which is markdown appended to a file.
 *
 * The value of this tool shows up in a diff, not in a terminal nobody opens.
 */

const REASON_TITLES: Record<string, string> = {
  'selector-unmatched': 'Selector matches no test',
  'selector-ambiguous': 'Selector matches several tests',
  'matched-test-skipped': 'Matched test is skipped',
  'missing-selector': 'No selector',
  'low-similarity': 'Best candidate too weak',
  'no-candidate': 'No candidate test',
  'heuristic-weak': 'Similarity in the uncertain band',
};

/** `::error file=...,line=...,title=...::message`, one line, escaped. */
function command(
  kind: 'error' | 'warning' | 'notice',
  properties: Record<string, string | number>,
  message: string,
): string {
  const rendered = Object.entries(properties)
    .map(([key, value]) => `${key}=${escapeProperty(String(value))}`)
    .join(',');
  return `::${kind} ${rendered}::${escapeData(message)}`;
}

// The escaping rules are GitHub's: a raw newline would end the command early
// and the rest of the message would be printed as ordinary log output.
function escapeData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function messageFor(result: CriterionResult): string {
  const head = `${result.scenario}: ${REASON_TITLES[result.reason] ?? result.reason}`;
  if (result.selector !== null && result.match.test === null) {
    return `${head}. No test is titled ${JSON.stringify(result.selector)}.`;
  }
  if (result.match.test) {
    return (
      `${head}. Closest test is ${JSON.stringify(result.match.test.fullName)} ` +
      `at ${result.match.test.file}:${result.match.test.line}.`
    );
  }
  return (
    `${head}. Link it with an openspec-guard:test comment under the scenario heading, ` +
    'or declare it non-testable with a reason.'
  );
}

export interface AnnotationOptions {
  max: number;
}

/**
 * Annotations for the criteria a reviewer can act on: what the gate would fail
 * on, or would have failed on. Baselined criteria are frozen debt and are
 * deliberately silent, or every pull request would carry hundreds of them.
 */
export function annotationsFor(report: Report, options: AnnotationOptions): string[] {
  const actionable = report.results.filter(
    (result) => !result.baselined && (result.verdict === 'fail' || result.verdict === 'uncertain'),
  );

  const lines = actionable
    .slice(0, options.max)
    .map((result) =>
      command(
        result.verdict === 'fail' ? 'error' : 'warning',
        { file: result.source.file, line: result.source.line, title: 'openspec-guard' },
        messageFor(result),
      ),
    );

  if (actionable.length > options.max) {
    lines.push(
      command(
        'notice',
        { title: 'openspec-guard' },
        `${actionable.length - options.max} more uncovered scenarios are not annotated here. ` +
          'See the job summary.',
      ),
    );
  }

  return lines;
}

function count(report: Report, reason: string): number {
  return report.results.filter((result) => !result.baselined && result.reason === reason).length;
}

export function summaryFor(report: Report): string {
  const { summary, input } = report;
  const rows: [string, number][] = [
    ['Selector matches no test', count(report, 'selector-unmatched')],
    ['Selector matches several tests', count(report, 'selector-ambiguous')],
    ['Matched test is skipped', count(report, 'matched-test-skipped')],
    ['No selector (--require-selector)', count(report, 'missing-selector')],
    ['Best candidate too weak', count(report, 'low-similarity')],
    ['No candidate test', count(report, 'no-candidate')],
    ['Similarity in the uncertain band', count(report, 'heuristic-weak')],
  ];

  const lines = [
    '## openspec-guard',
    '',
    `**${summary.total} criteria** in \`${input.specRoot}\`, checked against ` +
      `${input.testTitleCount} test titles found by ${input.runner}.`,
    '',
    '| Verdict | Count |',
    '| --- | ---: |',
    `| pass | ${summary.pass} |`,
    `| uncertain | ${summary.uncertain} |`,
    `| fail | ${summary.fail} |`,
    `| skip | ${summary.skip} |`,
  ];

  // The baselined row belongs to the table, so it goes in before anything that
  // closes it.
  if (summary.baselined > 0) {
    lines.push(`| frozen by the baseline | ${summary.baselined} |`);
  }

  lines.push(
    '',
    `**${summary.coverage}%** of the ${summary.total - summary.skip} checkable criteria are ` +
      'linked to a test.',
    '',
    summary.pass > 0
      ? `Of the ${summary.pass} passing, ${summary.passBySelector} are linked by an explicit ` +
          `selector and ${summary.passByHeuristic} by similarity.`
      : 'Nothing passes yet.',
    '',
  );

  const actionable = rows.filter(([, value]) => value > 0);
  if (actionable.length > 0) {
    lines.push('### What is not covered', '', '| Reason | Count |', '| --- | ---: |');
    for (const [label, value] of actionable) lines.push(`| ${label} | ${value} |`);
    lines.push('');
  }

  if (!report.gates.passed) {
    lines.push('### Gate', '');
    for (const violation of report.gates.violations) lines.push(`- ${violation}`);
    lines.push('');
  }

  if (summary.baselined > 0 && report.diagnostics.staleBaselineEntries.length > 0) {
    lines.push(
      `${report.diagnostics.staleBaselineEntries.length} baseline entries match nothing any ` +
        'more. Prune them with `openspec-guard check --update-baseline`.',
      '',
    );
  }

  return lines.join('\n');
}

export interface Outputs {
  total: string;
  pass: string;
  uncertain: string;
  fail: string;
  skip: string;
  baselined: string;
  coverage: string;
  'gate-passed': string;
}

export function outputsFor(report: Report): Outputs {
  const { summary } = report;
  return {
    total: String(summary.total),
    pass: String(summary.pass),
    uncertain: String(summary.uncertain),
    fail: String(summary.fail),
    skip: String(summary.skip),
    baselined: String(summary.baselined),
    coverage: String(summary.coverage),
    'gate-passed': String(report.gates.passed),
  };
}

/**
 * The `GITHUB_OUTPUT` file format. The delimiter form is used unconditionally
 * because a value containing a newline would otherwise break the file, and
 * silently corrupt every output after it.
 */
export function renderOutputs(outputs: Outputs): string {
  return Object.entries(outputs)
    .map(([name, value]) => `${name}<<__OPENSPEC_GUARD__\n${value}\n__OPENSPEC_GUARD__`)
    .join('\n')
    .concat('\n');
}
