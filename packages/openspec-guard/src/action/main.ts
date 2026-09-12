import { appendFile } from 'node:fs/promises';

import { AnnotationErrors, runCheck } from '../commands/check.js';
import { EXIT_GATE, EXIT_INPUT, EXIT_INTERNAL, EXIT_OK, isOpenSpecGuardError } from '../errors.js';
import { renderJson } from '../report/json.js';
import { DEFAULT_TERMINAL_OPTIONS, renderTerminal } from '../report/terminal.js';
import { annotationsFor, outputsFor, renderOutputs, summaryFor } from './annotate.js';
import { readConfig, type Env } from './inputs.js';

/**
 * The Action entry point.
 *
 * It is the CLI's twin with a different skin: same `runCheck`, same exit codes,
 * a working directory taken from `GITHUB_WORKSPACE` instead of the shell. All
 * side effects are injected so the whole thing runs in a test with no runner
 * and no files.
 */

export interface ActionIo {
  env: Env;
  /** Workflow commands and human output. Both go to stdout, which is the log. */
  log: (line: string) => void;
  /** Appends to a file named by an environment variable, if that name is set. */
  appendTo: (envName: string, content: string) => Promise<void>;
}

export const realIo: ActionIo = {
  env: process.env,
  log: (line) => process.stdout.write(`${line}\n`),
  appendTo: async (envName, content) => {
    const target = process.env[envName];
    if (target === undefined || target === '') return;
    await appendFile(target, content, 'utf8');
  },
};

export async function runAction(io: ActionIo = realIo): Promise<number> {
  let config;
  try {
    config = readConfig(io.env);
  } catch (error) {
    io.log(`::error title=openspec-guard::${errorMessage(error)}`);
    return EXIT_INPUT;
  }

  try {
    const { report, exitCode, baselineUpdate } = await runCheck(config.check);

    io.log(
      config.format === 'json'
        ? renderJson(report)
        : renderTerminal(report, { ...DEFAULT_TERMINAL_OPTIONS, color: false }),
    );

    if (baselineUpdate) {
      io.log(
        `Baseline written to ${baselineUpdate.file}: ${baselineUpdate.total} frozen criteria ` +
          `(+${baselineUpdate.diff.added.length}, -${baselineUpdate.diff.removed.length}).`,
      );
    }

    if (config.annotations) {
      for (const line of annotationsFor(report, { max: config.maxAnnotations })) io.log(line);
    }
    if (config.summary) {
      await io.appendTo('GITHUB_STEP_SUMMARY', `${summaryFor(report)}\n`);
    }
    await io.appendTo('GITHUB_OUTPUT', renderOutputs(outputsFor(report)));

    if (exitCode === EXIT_GATE) {
      // The gate message is already in the log and the summary. This line is
      // what turns the step red.
      io.log(`::error title=openspec-guard::${report.gates.violations.join('; ')}`);
    }
    return exitCode;
  } catch (error) {
    if (error instanceof AnnotationErrors) {
      for (const entry of error.errors) {
        io.log(
          `::error file=${entry.location?.file ?? ''},line=${entry.location?.line ?? 1},` +
            `title=openspec-guard::${entry.message}`,
        );
      }
      return EXIT_INPUT;
    }
    if (isOpenSpecGuardError(error)) {
      io.log(`::error title=openspec-guard::${error.format()}`);
      return error.exitCode;
    }
    io.log(`::error title=openspec-guard::Internal error. ${errorMessage(error)}`);
    return EXIT_INTERNAL;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { EXIT_OK };
