#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';

import { AnnotationErrors, runCheck, type CheckInput } from './commands/check.js';
import { runLink } from './commands/link.js';
import { createTerminalAsk } from './link/prompt.js';
import {
  EXIT_INPUT,
  EXIT_INTERNAL,
  EXIT_OK,
  isOpenSpecGuardError,
  OpenSpecGuardError,
} from './errors.js';
import { renderJson } from './report/json.js';
import { DEFAULT_TERMINAL_OPTIONS, renderTerminal } from './report/terminal.js';
import type { Runner } from './tests/detect.js';
import type { Verdict } from './types.js';
import { VERSION } from './version.js';

/**
 * Argument parsing and exit codes. No business logic lives here.
 *
 * `parseArgs` in strict mode means zero dependency and, more importantly,
 * unknown options raise instead of being silently ignored.
 */

const HELP = `openspec-guard ${VERSION}

  Check which OpenSpec scenarios are covered by a Vitest or Jest test.
  Reads specs and test titles. Never runs the tests. Never calls an LLM.

Usage
  openspec-guard check [options]     report coverage, optionally gate on it
  openspec-guard link  [options]     walk unlinked scenarios and write selectors

Discovery
  --cwd <dir>              Working directory (default: the current one)
  --specs <dir>            Spec root (default: openspec/specs, else specs)
  --code <dir>             Code root (default: --cwd)
  --tests <glob>           Test file glob, repeatable
  --runner vitest|jest     Skip runner detection
  --include-changes        Also read delta specs under openspec/changes
  --allow-empty            Succeed on a spec root that holds no spec.md

Matching
  --require-selector       Turn similarity off; only explicit selectors link
  --pass-threshold <n>     Similarity needed to pass (default: 0.6)
  --uncertain-threshold <n>  Similarity needed to be uncertain (default: 0.25)
  --min-shared-terms <n>   Shared words needed to pass (default: 2)

Output
  --format terminal|json   Report format (default: terminal)
  --verbose                Print every row, including passes and skips
  --no-color               Never emit ANSI colour
  --max-rows <n>           Rows per group before truncation (default: 20)

link
  --limit <n>              Stop after n scenarios
  --max-candidates <n>     Candidates offered per scenario (default: 5)
  --min-score <n>          Hide candidates below this similarity (default: 0)
  --dry-run                Decide everything, write nothing
  --order confidence|document  Walk best-ranked first (default), or in order

Baseline
  --baseline <file>        Freeze the criteria listed there: gates ignore them
  --update-baseline        Rewrite the baseline from this run, then exit 0

Gates
  --fail-on <list>         Comma-separated verdicts that must not appear,
                           among pass, uncertain, fail, skip
  --min-pass <n>           Minimum number of passing criteria
  --min-coverage <n>       Minimum percentage of checkable criteria linked to a
                           test. Non-testable scenarios are out of the
                           denominator; a baseline never raises this number

Exit codes
  0  success
  1  a gate was violated, and nothing else
  2  the input or an option is at fault
  3  an internal error: our bug

Linking a scenario to a test is an explicit OpenSpec Guard annotation, never
OpenSpec syntax. Put it directly under the scenario heading:

  #### Scenario: Sign up with a valid email
  <!-- openspec-guard:test="creates a user with a valid email" -->

Similarity is a convenience for repositories whose specs and tests are written
in the same language. It compares words; it does not translate them.

Adopting this on an existing repository starts with:

  openspec-guard check --update-baseline
  openspec-guard check --baseline .openspec-guard-baseline.json --fail-on fail

which freezes today's uncovered scenarios and fails only on new ones.
`;

const VERDICTS = new Set<Verdict>(['pass', 'uncertain', 'fail', 'skip']);
const RUNNERS = new Set<Runner>(['vitest', 'jest']);
const FORMATS = new Set(['terminal', 'json']);

function optionError(message: string): OpenSpecGuardError {
  return new OpenSpecGuardError('E_OPTION', message);
}

function parseNumber(raw: string | undefined, name: string, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw optionError(`${name} expects a number between ${min} and ${max}, got ${String(raw)}.`);
  }
  return value;
}

function parseFailOn(raw: string | undefined): Verdict[] {
  if (raw === undefined) return [];
  const verdicts = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  for (const verdict of verdicts) {
    if (!VERDICTS.has(verdict as Verdict)) {
      throw optionError(
        `--fail-on does not know ${JSON.stringify(verdict)}. ` +
          'Expected some of: pass, uncertain, fail, skip.',
      );
    }
  }
  return verdicts as Verdict[];
}

function parseOrder(raw: string | undefined): 'confidence' | 'document' | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'confidence' || raw === 'document') return raw;
  throw optionError(`--order expects confidence or document, got ${JSON.stringify(raw)}.`);
}

interface ParsedCommand {
  command: 'check' | 'link';
  input: CheckInput;
  link: {
    limit: number | undefined;
    maxCandidates: number | undefined;
    minScore: number | undefined;
    dryRun: boolean;
    order: 'confidence' | 'document' | undefined;
  };
  format: 'terminal' | 'json';
  color: boolean;
  verbose: boolean;
  maxRows: number;
}

function build(argv: readonly string[]): ParsedCommand | 'help' | 'version' {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
      cwd: { type: 'string' },
      specs: { type: 'string' },
      code: { type: 'string' },
      tests: { type: 'string', multiple: true },
      runner: { type: 'string' },
      'include-changes': { type: 'boolean' },
      'allow-empty': { type: 'boolean' },
      'require-selector': { type: 'boolean' },
      format: { type: 'string' },
      verbose: { type: 'boolean' },
      'no-color': { type: 'boolean' },
      'max-rows': { type: 'string' },
      'fail-on': { type: 'string' },
      'min-pass': { type: 'string' },
      'min-coverage': { type: 'string' },
      'pass-threshold': { type: 'string' },
      'uncertain-threshold': { type: 'string' },
      'min-shared-terms': { type: 'string' },
      baseline: { type: 'string' },
      'update-baseline': { type: 'boolean' },
      limit: { type: 'string' },
      'max-candidates': { type: 'string' },
      'min-score': { type: 'string' },
      'dry-run': { type: 'boolean' },
      order: { type: 'string' },
    },
  });

  if (values.help === true) return 'help';
  if (values.version === true) return 'version';

  const [command, ...rest] = positionals;
  if (command === undefined) return 'help';
  if (command !== 'check' && command !== 'link') {
    throw optionError(`Unknown command ${JSON.stringify(command)}. Known commands: check, link.`);
  }
  if (rest.length > 0) {
    throw optionError(`'${command}' takes no positional argument, got ${JSON.stringify(rest[0])}.`);
  }

  if (values.runner !== undefined && !RUNNERS.has(values.runner as Runner)) {
    throw optionError(`--runner expects vitest or jest, got ${JSON.stringify(values.runner)}.`);
  }
  const format = values.format ?? 'terminal';
  if (!FORMATS.has(format)) {
    throw optionError(`--format expects terminal or json, got ${JSON.stringify(format)}.`);
  }

  const passThreshold =
    values['pass-threshold'] === undefined
      ? undefined
      : parseNumber(values['pass-threshold'], '--pass-threshold', 0, 1);
  const uncertainThreshold =
    values['uncertain-threshold'] === undefined
      ? undefined
      : parseNumber(values['uncertain-threshold'], '--uncertain-threshold', 0, 1);
  if (
    passThreshold !== undefined &&
    uncertainThreshold !== undefined &&
    uncertainThreshold > passThreshold
  ) {
    throw optionError('--uncertain-threshold cannot be greater than --pass-threshold.');
  }

  const input: CheckInput = {
    cwd: path.resolve(values.cwd ?? process.cwd()),
    specsPath: values.specs,
    codePath: values.code,
    testGlobs: values.tests,
    includeChanges: values['include-changes'],
    allowEmpty: values['allow-empty'],
    runner: values.runner as Runner | undefined,
    requireSelector: values['require-selector'],
    failOn: parseFailOn(values['fail-on']),
    minPass:
      values['min-pass'] === undefined
        ? null
        : parseNumber(values['min-pass'], '--min-pass', 0, Number.MAX_SAFE_INTEGER),
    minCoverage:
      values['min-coverage'] === undefined
        ? null
        : parseNumber(values['min-coverage'], '--min-coverage', 0, 100),
    passThreshold,
    uncertainThreshold,
    minSharedTerms:
      values['min-shared-terms'] === undefined
        ? undefined
        : parseNumber(values['min-shared-terms'], '--min-shared-terms', 0, 100),
    baseline: values.baseline,
    updateBaseline: values['update-baseline'],
  };

  return {
    command,
    input,
    link: {
      limit:
        values.limit === undefined
          ? undefined
          : parseNumber(values.limit, '--limit', 1, Number.MAX_SAFE_INTEGER),
      maxCandidates:
        values['max-candidates'] === undefined
          ? undefined
          : parseNumber(values['max-candidates'], '--max-candidates', 1, 9),
      minScore:
        values['min-score'] === undefined
          ? undefined
          : parseNumber(values['min-score'], '--min-score', 0, 1),
      dryRun: values['dry-run'] === true,
      order: parseOrder(values.order),
    },
    format: format as 'terminal' | 'json',
    // NO_COLOR is honoured because a report that lands in a log file should not
    // be full of escape sequences.
    color:
      values['no-color'] !== true &&
      process.env.NO_COLOR === undefined &&
      process.stdout.isTTY === true,
    verbose: values.verbose === true,
    maxRows:
      values['max-rows'] === undefined
        ? DEFAULT_TERMINAL_OPTIONS.maxRowsPerGroup
        : parseNumber(values['max-rows'], '--max-rows', 1, Number.MAX_SAFE_INTEGER),
  };
}

/**
 * `link` is interactive by nature, so it writes its whole conversation to
 * stderr and leaves stdout for the summary. A run that is not attached to a
 * terminal is refused rather than silently answering its own questions.
 */
async function runLinkCommand(command: ParsedCommand): Promise<void> {
  if (process.stdin.isTTY !== true) {
    process.stderr.write(
      'link needs a terminal: it asks a question per scenario. ' +
        'Use check --update-baseline to freeze debt without answering anything.\n',
    );
    process.exitCode = EXIT_INPUT;
    return;
  }

  const { ask, close } = createTerminalAsk(Number.MAX_SAFE_INTEGER);
  try {
    const result = await runLink({
      ...command.input,
      maxCandidates: command.link.maxCandidates,
      limit: command.link.limit,
      minScore: command.link.minScore,
      dryRun: command.link.dryRun,
      order: command.link.order,
      ask,
    });

    const written = result.dryRun ? 'would be written' : 'written';
    process.stdout.write(
      `${result.linked.length} linked, ${result.markedNonTestable.length} marked non-testable, ` +
        `${result.skipped} skipped, ${result.remaining} left. ` +
        `${result.dryRun ? 0 : result.filesWritten.length} file(s) ${written}.\n`,
    );
    process.exitCode = EXIT_OK;
  } finally {
    close();
  }
}

export async function main(argv: readonly string[]): Promise<void> {
  let command: ParsedCommand | 'help' | 'version';
  try {
    command = build(argv);
  } catch (error) {
    // parseArgs raises a plain TypeError on an unknown option. That is still a
    // faulty invocation, not our bug.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = EXIT_INPUT;
    return;
  }

  if (command === 'help') {
    process.stdout.write(HELP);
    process.exitCode = EXIT_OK;
    return;
  }
  if (command === 'version') {
    process.stdout.write(`${VERSION}\n`);
    process.exitCode = EXIT_OK;
    return;
  }

  try {
    if (command.command === 'link') {
      await runLinkCommand(command);
      return;
    }

    const { report, exitCode, baselineUpdate } = await runCheck(command.input);

    if (baselineUpdate) {
      const { file, diff, total } = baselineUpdate;
      // Straight to stderr: --update-baseline is a maintenance action, and a
      // caller piping --format json still gets only the document on stdout.
      process.stderr.write(
        `Baseline written to ${file}: ${total} frozen criteria ` +
          `(+${diff.added.length}, -${diff.removed.length}).\n`,
      );
    }

    if (command.format === 'json') {
      process.stdout.write(renderJson(report));
    } else {
      process.stdout.write(
        renderTerminal(report, {
          color: command.color,
          verbose: command.verbose,
          maxRowsPerGroup: command.maxRows,
        }),
      );
    }

    // Assigned, never process.exit(): an immediate exit truncates stdout on a
    // pipe, which is what makes `--format json | jq` fail now and then.
    process.exitCode = exitCode;
  } catch (error) {
    if (error instanceof AnnotationErrors) {
      for (const entry of error.errors) process.stderr.write(`${entry.format()}\n`);
      process.stderr.write(`${error.errors.length} annotation error(s). Nothing was checked.\n`);
      process.exitCode = error.exitCode;
      return;
    }
    if (isOpenSpecGuardError(error)) {
      process.stderr.write(`${error.format()}\n`);
      process.exitCode = error.exitCode;
      return;
    }
    process.stderr.write(
      `Internal error. This is a OpenSpec Guard bug, please report it.\n${
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      }\n`,
    );
    process.exitCode = EXIT_INTERNAL;
  }
}

await main(process.argv.slice(2));
