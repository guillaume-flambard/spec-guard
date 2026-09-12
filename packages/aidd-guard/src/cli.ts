#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { runCheck } from './commands/check.js';
import { runLink, type LinkResult } from './commands/link.js';
import { createTerminalAsk } from './link/prompt.js';
import {
  AiddGuardError,
  AnnotationErrors,
  EXIT_INPUT,
  EXIT_INTERNAL,
  isAiddGuardError,
} from './errors.js';
import { renderJson } from './report/json.js';
import { renderTerminal } from './report/terminal.js';
import type { Verdict } from './types.js';
import { VERSION } from './version.js';

/**
 * Argument parsing, output, exit codes. Nothing else.
 *
 * Written by hand rather than with a parser library: the surface is small, the
 * package stays at one runtime dependency, and an unknown flag can be refused
 * rather than ignored. A gate that silently drops `--fail-on` because of a typo
 * is worse than no gate at all.
 */

const USAGE = `aidd-guard ${VERSION}

  Reports which AIDD acceptance criteria are covered by a test.
  Reads Done-when lines and acceptance checkboxes; never runs your tests,
  never calls a model. Same input, same bytes.

Usage
  aidd-guard check [options]     report what is linked and what is not
  aidd-guard link  [options]     walk the unlinked criteria and write selectors

Options for check
  --tasks <path>          Task documents root (default: aidd_docs/tasks, then docs/tasks)
  --docs <glob>           Documents to read, repeatable
                          (default: **/spec.md, **/plan.md, **/phase-*.md)
  --code <path>           Where the tests live (default: the working directory)
  --tests <glob>          Test files, repeatable (default: **/*.{test,spec}.*)
  --runner vitest|jest    Skip runner detection
  --require-selector      A criterion with no explicit selector fails
  --fail-on <verdicts>    Comma-separated: fail,uncertain,skip,pass
  --min-pass <n>          Fail under n linked criteria
  --min-coverage <pct>    Fail under pct% of checkable criteria linked
  --fail-claimed          Fail when a ticked box has no test behind it
  --allow-empty           Do not fail when no task document is found
  --format terminal|json  Output shape (default: terminal)
  --verbose               List every criterion, not only what needs an action
  --no-color              Never emit ANSI colour
  --version, --help

Options for link
  --limit <n>             Stop after n criteria
  --claimed               Only walk criteria whose box is already ticked
  --order confidence|document   Best candidates first (default), or file order
  --max-candidates <n>    Candidates offered per criterion (default: 5)
  --min-score <0-1>       Hide candidates scoring below this
  --dry-run               Decide everything, write nothing
  (--tasks, --docs, --code, --tests, --runner also apply)

Linking a criterion to a test

  - [ ] A visitor who submits a valid email receives a confirmation.
    <!-- aidd-guard:test="creates a user with a valid email" -->

  For something no automated test can cover, say so and say why:

  - [ ] The legal sign-off is recorded.
    <!-- aidd-guard:non-testable reason="Requires a human legal assessment" -->

Exit codes
  0 everything the gates asked for       2 bad input, option or annotation
  1 a gate was violated                  3 aidd-guard's own bug
`;

const VERDICTS = new Set<Verdict>(['pass', 'uncertain', 'fail', 'skip']);

interface Parsed {
  command: string | null;
  values: Map<string, string[]>;
  flags: Set<string>;
}

const VALUE_FLAGS = new Set([
  '--limit',
  '--max-candidates',
  '--min-score',
  '--order',
  '--tasks',
  '--docs',
  '--code',
  '--tests',
  '--runner',
  '--fail-on',
  '--min-pass',
  '--min-coverage',
  '--format',
  '--pass-threshold',
  '--uncertain-threshold',
  '--min-shared-terms',
]);

const BOOLEAN_FLAGS = new Set([
  '--dry-run',
  '--claimed',
  '--require-selector',
  '--fail-claimed',
  '--allow-empty',
  '--verbose',
  '--no-color',
  '--help',
  '-h',
  '--version',
  '-v',
]);

function parseArgv(argv: readonly string[]): Parsed {
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  let command: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;

    if (!argument.startsWith('-')) {
      if (command === null) command = argument;
      else throw new AiddGuardError('E_OPTION', `Unexpected argument ${JSON.stringify(argument)}.`);
      continue;
    }

    // `--flag=value` and `--flag value` are both accepted.
    const equals = argument.indexOf('=');
    const name = equals === -1 ? argument : argument.slice(0, equals);

    if (BOOLEAN_FLAGS.has(name)) {
      if (equals !== -1) {
        throw new AiddGuardError('E_OPTION', `${name} takes no value.`);
      }
      flags.add(name);
      continue;
    }

    if (!VALUE_FLAGS.has(name)) {
      throw new AiddGuardError('E_OPTION', `Unknown option ${JSON.stringify(name)}.`);
    }

    let value: string;
    if (equals !== -1) {
      value = argument.slice(equals + 1);
    } else {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new AiddGuardError('E_OPTION', `${name} needs a value.`);
      }
      value = next;
      index += 1;
    }

    const bucket = values.get(name);
    if (bucket) bucket.push(value);
    else values.set(name, [value]);
  }

  return { command, values, flags };
}

function single(parsed: Parsed, name: string): string | undefined {
  const bucket = parsed.values.get(name);
  if (bucket === undefined) return undefined;
  if (bucket.length > 1) {
    throw new AiddGuardError('E_OPTION', `${name} was given more than once.`);
  }
  return bucket[0];
}

function integer(parsed: Parsed, name: string): number | null {
  const raw = single(parsed, name);
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new AiddGuardError('E_OPTION', `${name} expects a non-negative number, got ${raw}.`);
  }
  return value;
}

function verdicts(parsed: Parsed): Verdict[] {
  const raw = single(parsed, '--fail-on');
  if (raw === undefined) return [];
  const out: Verdict[] = [];
  for (const part of raw.split(',')) {
    const name = part.trim();
    if (name === '') continue;
    if (!VERDICTS.has(name as Verdict)) {
      throw new AiddGuardError(
        'E_OPTION',
        `--fail-on does not know ${JSON.stringify(name)}. Known verdicts: pass, uncertain, fail, skip.`,
      );
    }
    out.push(name as Verdict);
  }
  return out;
}

export async function main(argv: readonly string[], cwd: string): Promise<number> {
  const parsed = parseArgv(argv);

  // `--version` is answered before anything else, including a missing command:
  // a script asking for the version must never be handed a usage screen.
  if (parsed.flags.has('--version') || parsed.flags.has('-v')) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (parsed.flags.has('--help') || parsed.flags.has('-h') || parsed.command === null) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (parsed.command !== 'check' && parsed.command !== 'link') {
    throw new AiddGuardError(
      'E_OPTION',
      `Unknown command ${JSON.stringify(parsed.command)}. The commands are 'check' and 'link'.`,
    );
  }

  const runner = single(parsed, '--runner');
  if (runner !== undefined && runner !== 'vitest' && runner !== 'jest') {
    throw new AiddGuardError('E_OPTION', `--runner expects 'vitest' or 'jest', got ${runner}.`);
  }

  const discovery = {
    cwd,
    tasksPath: single(parsed, '--tasks'),
    docGlobs: parsed.values.get('--docs'),
    codePath: single(parsed, '--code'),
    testGlobs: parsed.values.get('--tests'),
    allowEmpty: parsed.flags.has('--allow-empty'),
  };

  if (parsed.command === 'link') {
    return runLinkCommand(parsed, discovery, runner);
  }

  const format = single(parsed, '--format') ?? 'terminal';
  if (format !== 'terminal' && format !== 'json') {
    throw new AiddGuardError('E_OPTION', `--format expects 'terminal' or 'json', got ${format}.`);
  }

  const { report, exitCode } = await runCheck({
    ...discovery,
    runner,
    requireSelector: parsed.flags.has('--require-selector'),
    failOn: verdicts(parsed),
    minPass: integer(parsed, '--min-pass'),
    minCoverage: integer(parsed, '--min-coverage'),
    failClaimed: parsed.flags.has('--fail-claimed'),
  });

  if (format === 'json') {
    // The document goes to stdout alone, so a redirect captures exactly it.
    process.stdout.write(renderJson(report));
  } else {
    process.stdout.write(
      renderTerminal(report, {
        verbose: parsed.flags.has('--verbose'),
        colour: !parsed.flags.has('--no-color') && process.stdout.isTTY === true,
      }),
    );
  }

  return exitCode;
}

/**
 * The `link` session.
 *
 * Two runs of the same core: the first one counts what there is to do, so the
 * prompt can say `[3/47]` from the very first question, and the second one is
 * the real walk. Counting costs one extra parse of documents already in the
 * page cache, and knowing the size of the queue is what stops an operator from
 * abandoning it halfway.
 */
async function runLinkCommand(
  parsed: Parsed,
  discovery: {
    cwd: string;
    tasksPath: string | undefined;
    docGlobs: string[] | undefined;
    codePath: string | undefined;
    testGlobs: string[] | undefined;
    allowEmpty: boolean;
  },
  runner: 'vitest' | 'jest' | undefined,
): Promise<number> {
  const order: 'confidence' | 'document' = ((): 'confidence' | 'document' => {
    const raw = single(parsed, '--order') ?? 'confidence';
    if (raw !== 'confidence' && raw !== 'document') {
      throw new AiddGuardError(
        'E_OPTION',
        `--order expects 'confidence' or 'document', got ${raw}.`,
      );
    }
    return raw;
  })();

  const minScore = single(parsed, '--min-score');
  const score = minScore === undefined ? undefined : Number(minScore);
  if (score !== undefined && (!Number.isFinite(score) || score < 0 || score > 1)) {
    throw new AiddGuardError('E_OPTION', `--min-score expects a number between 0 and 1.`);
  }

  const shared = {
    ...discovery,
    runner,
    claimedOnly: parsed.flags.has('--claimed'),
    order,
    ...(score === undefined ? {} : { minScore: score }),
    maxCandidates: integer(parsed, '--max-candidates') ?? undefined,
  };

  // Pass one: how many criteria are waiting. Answering `quit` to every
  // proposal decides nothing and writes nothing.
  const survey = await runLink({
    ...shared,
    dryRun: true,
    ask: () => Promise.resolve({ kind: 'quit' }),
  });

  if (survey.considered === 0) {
    process.stderr.write('Every criterion already carries an annotation. Nothing to link.\n');
    return 0;
  }

  const { ask, close } = createTerminalAsk(
    Math.min(survey.considered, integer(parsed, '--limit') ?? survey.considered),
  );

  let result: LinkResult;
  try {
    result = await runLink({
      ...shared,
      limit: integer(parsed, '--limit') ?? undefined,
      dryRun: parsed.flags.has('--dry-run'),
      ask,
    });
  } finally {
    close();
  }

  const lines = [
    '',
    `${result.linked.length} linked, ${result.markedNonTestable.length} marked non-testable, ` +
      `${result.skipped} skipped, ${result.remaining} left.`,
  ];
  if (result.dryRun) {
    lines.push('--dry-run: nothing was written.');
  } else if (result.filesWritten.length > 0) {
    lines.push(`Written: ${result.filesWritten.join(', ')}`);
    lines.push('Run `aidd-guard check` to see the new verdicts.');
  }
  process.stderr.write(`${lines.join('\n')}\n`);

  return 0;
}

export function reportError(error: unknown): number {
  if (error instanceof AnnotationErrors) {
    for (const annotationError of error.errors) {
      process.stderr.write(`${annotationError.format()}\n`);
    }
    return EXIT_INPUT;
  }
  if (isAiddGuardError(error)) {
    process.stderr.write(`${error.format()}\n`);
    return error.exitCode;
  }
  // Our bug, and it says so: a 3 must never send anyone hunting through an
  // innocent task document.
  process.stderr.write(
    `aidd-guard failed unexpectedly. This is a bug in aidd-guard, not in your documents.\n` +
      `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  return EXIT_INTERNAL;
}

/**
 * Was this file run, or imported?
 *
 * Comparing `import.meta.url` to `process.argv[1]` as strings is the usual
 * one-liner, and it is wrong for anything installed: a package manager puts a
 * **symlink** in `node_modules/.bin`, so `argv[1]` is the link while
 * `import.meta.url` is the file it points at. The two never match, the CLI
 * silently does nothing, and the process exits 0 as if all was well. That is
 * exactly what `npx github:...` did before this: no output, no error, no clue.
 *
 * Both sides are resolved through `realpath` instead.
 */
const invokedDirectly = ((): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    // An entry point that cannot be resolved is not this file.
    return false;
  }
})();

if (invokedDirectly) {
  main(process.argv.slice(2), process.cwd())
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.exitCode = reportError(error);
    });
}
