import { readFile } from 'node:fs/promises';

import {
  buildBaseline,
  DEFAULT_BASELINE_PATH,
  diffBaseline,
  isBaselined,
  loadBaseline,
  staleEntries,
  writeBaseline,
  type Baseline,
  type BaselineCandidate,
  type BaselineDiff,
} from '../baseline.js';
import { buildCriteria } from '../criteria.js';
import { discover, type DiscoveryOptions } from '../discovery.js';
import { EXIT_GATE, EXIT_INPUT, EXIT_OK, OpenSpecGuardError } from '../errors.js';
import {
  buildTestIndex,
  DEFAULT_MIN_SHARED_TERMS,
  DEFAULT_PASS_THRESHOLD,
  DEFAULT_UNCERTAIN_THRESHOLD,
  matchCriterion,
} from '../matching/match.js';
import { parseSpec } from '../openspec/parse.js';
import { detectRunner, type Runner } from '../tests/detect.js';
import { extractTestTitles } from '../tests/extract.js';
import type { Candidate, TestTitle, Verdict } from '../types.js';
import { decideVerdict, evaluateGates, summarize, type CriterionOutcome } from '../verdict.js';
import { VERSION } from '../version.js';
import type { CriterionResult, Report, TestRef } from '../report/types.js';
import { SCHEMA_VERSION } from '../report/types.js';

/**
 * The only place that composes the modules. Everything it needs is passed in:
 * no module below the CLI ever calls `process.cwd()`, which is what lets the
 * GitHub Action hand over `GITHUB_WORKSPACE` and change nothing else.
 */

export interface CheckInput extends DiscoveryOptions {
  runner?: Runner | undefined;
  requireSelector?: boolean | undefined;
  failOn?: Verdict[] | undefined;
  minPass?: number | null | undefined;
  passThreshold?: number | undefined;
  uncertainThreshold?: number | undefined;
  minSharedTerms?: number | undefined;
  /** Minimum percentage of checkable criteria linked to a test. */
  minCoverage?: number | null | undefined;
  /** Path to a baseline, relative to cwd. */
  baseline?: string | undefined;
  /** Rewrite the baseline from this run instead of checking against it. */
  updateBaseline?: boolean | undefined;
}

export interface CheckOutcome {
  report: Report;
  exitCode: number;
  /** Present only when the run rewrote a baseline. */
  baselineUpdate?: { file: string; diff: BaselineDiff; total: number };
}

function toRef(candidate: Candidate | null): TestRef | null {
  if (!candidate) return null;
  return {
    fullName: candidate.fullName,
    file: candidate.file,
    line: candidate.line,
    skipped: candidate.skipped,
  };
}

/** Sorted by (file, line, id), so two runs list results in the same order. */
function compareResults(left: CriterionResult, right: CriterionResult): number {
  if (left.source.file !== right.source.file) return left.source.file < right.source.file ? -1 : 1;
  if (left.source.line !== right.source.line) return left.source.line - right.source.line;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export async function runCheck(input: CheckInput): Promise<CheckOutcome> {
  const discovery = await discover(input);

  const specs = await Promise.all(
    discovery.specs.map(async (spec) =>
      parseSpec(await readFile(spec.absolutePath, 'utf8'), spec.file, spec.capability),
    ),
  );

  const { criteria, errors, removedScenarioCount } = buildCriteria(specs);
  // Annotation problems are configuration errors. We surface all of them at
  // once rather than reporting a run built on a spec we could not read.
  if (errors.length > 0) throw new AnnotationErrors(errors);

  const baselinePath =
    input.updateBaseline === true ? (input.baseline ?? DEFAULT_BASELINE_PATH) : input.baseline;
  // When updating, an absent file is the normal first case, so it is read
  // leniently. When checking, a missing baseline is an error: a typo in the
  // path would otherwise un-suppress everything and fail a build silently.
  let baseline: Baseline | null = null;
  if (input.baseline !== undefined) {
    if (input.updateBaseline === true) {
      baseline = await loadBaseline(cwdOf(input), input.baseline).catch(() => null);
    } else {
      baseline = await loadBaseline(cwdOf(input), input.baseline);
    }
  }

  const detection = detectRunner(discovery.manifests, discovery.runnerConfigFiles, input.runner);

  const titles: TestTitle[] = [];
  const unparsedFiles: Report['diagnostics']['unparsedFiles'] = [];
  const dynamicTitles: Report['diagnostics']['dynamicTitles'] = [];

  for (const absolutePath of discovery.testFiles) {
    const relative = discovery.relative(absolutePath);
    const extraction = extractTestTitles(await readFile(absolutePath, 'utf8'), relative);
    titles.push(...extraction.titles);
    unparsedFiles.push(...extraction.unparsedFiles);
    dynamicTitles.push(...extraction.dynamicTitles);
  }

  const options = {
    passThreshold: input.passThreshold ?? DEFAULT_PASS_THRESHOLD,
    uncertainThreshold: input.uncertainThreshold ?? DEFAULT_UNCERTAIN_THRESHOLD,
    minSharedTerms: input.minSharedTerms ?? DEFAULT_MIN_SHARED_TERMS,
    heuristic: input.requireSelector !== true,
  };

  const index = buildTestIndex(titles);
  const outcomes: CriterionOutcome[] = [];
  const candidates: BaselineCandidate[] = [];
  const results: CriterionResult[] = criteria.map((criterion) => {
    const match = matchCriterion(criterion, index, options);
    const verdict = decideVerdict(match.reason);
    const candidate: BaselineCandidate = {
      id: criterion.id,
      verdict,
      reason: match.reason,
      capability: criterion.capability,
      scenario: criterion.scenario,
      file: criterion.file,
    };
    candidates.push(candidate);
    const suppressed = isBaselined(baseline, candidate);
    outcomes.push({ verdict, reason: match.reason, baselined: suppressed });

    return {
      id: criterion.id,
      verdict,
      reason: match.reason,
      capability: criterion.capability,
      requirement: criterion.requirement,
      scenario: criterion.scenario,
      operation: criterion.operation,
      namedScenario: criterion.isNamedScenario,
      baselined: suppressed,
      source: { file: criterion.file, line: criterion.line },
      selector: criterion.annotation?.kind === 'test' ? criterion.annotation.selector : null,
      nonTestableReason:
        criterion.annotation?.kind === 'non-testable' ? criterion.annotation.reason : null,
      match: {
        score: match.best?.score ?? 0,
        matchedOn: match.best?.matchedOn ?? null,
        sharedTerms: match.best?.sharedTerms ?? [],
        test: toRef(match.best),
        runnersUp: match.runnersUp.map(toRef).filter((ref): ref is TestRef => ref !== null),
      },
    };
  });

  results.sort(compareResults);

  const summary = summarize(outcomes);
  const failOn = input.failOn ?? [];
  const minPass = input.minPass ?? null;
  const minCoverage = input.minCoverage ?? null;
  // --fail-on and --min-pass see only what the baseline does not already hold
  // back: freeze the debt, fail on what is new. --min-coverage reads the whole
  // repository instead, so that freezing debt can never make the number go up.
  const gates = evaluateGates(
    summarize(outcomes.filter((outcome) => outcome.baselined !== true)),
    { failOn, minPass, minCoverage },
    summary,
  );

  const report: Report = {
    schemaVersion: SCHEMA_VERSION,
    tool: { name: 'openspec-guard', version: VERSION },
    input: {
      specRoot: discovery.relative(discovery.specRoot),
      codeRoot: discovery.relative(discovery.codeRoot) || '.',
      runner: detection.runner,
      runnerEvidence: detection.evidence,
      specFileCount: discovery.specs.length,
      testFileCount: discovery.testFiles.length,
      testTitleCount: titles.length,
      removedScenarioCount,
    },
    options: {
      baseline: baselinePath ?? null,
      failOn,
      minPass,
      minCoverage,
      heuristic: options.heuristic,
      includeChanges: input.includeChanges === true,
      passThreshold: options.passThreshold,
      uncertainThreshold: options.uncertainThreshold,
      minSharedTerms: options.minSharedTerms,
    },
    summary,
    gates,
    results,
    diagnostics: {
      parseWarnings: specs.flatMap((spec) =>
        spec.warnings.map((warning) => ({
          file: spec.file,
          line: warning.line,
          code: warning.code,
          message: warning.message,
        })),
      ),
      staleBaselineEntries: staleEntries(baseline, candidates).map((entry) => ({
        id: entry.id,
        scenario: entry.scenario,
        file: entry.file,
      })),
      unparsedFiles,
      dynamicTitles,
    },
  };

  if (input.updateBaseline === true) {
    const next = buildBaseline(candidates);
    const target = input.baseline ?? DEFAULT_BASELINE_PATH;
    await writeBaseline(cwdOf(input), target, next);
    // Writing a baseline is a maintenance action, not a check, so it never
    // fails a gate: the point is to record reality, whatever it is.
    return {
      report,
      exitCode: EXIT_OK,
      baselineUpdate: {
        file: target,
        diff: diffBaseline(baseline, next),
        total: next.entries.length,
      },
    };
  }

  return { report, exitCode: gates.passed ? EXIT_OK : EXIT_GATE };
}

function cwdOf(input: CheckInput): string {
  return input.cwd;
}

/** Carries every annotation error so the CLI can print them all at once. */
export class AnnotationErrors extends Error {
  readonly exitCode = EXIT_INPUT;
  readonly errors: OpenSpecGuardError[];

  constructor(errors: OpenSpecGuardError[]) {
    super(`${errors.length} annotation error(s)`);
    this.name = 'AnnotationErrors';
    this.errors = errors;
  }
}
