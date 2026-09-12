import { readFile } from 'node:fs/promises';

import { parseDocument } from '../aidd/parse.js';
import { buildCriteria } from '../criteria.js';
import { discover, type DiscoveryOptions } from '../discovery.js';
import { AnnotationErrors, EXIT_GATE, EXIT_OK } from '../errors.js';
import {
  buildTestIndex,
  DEFAULT_MIN_SHARED_TERMS,
  DEFAULT_PASS_THRESHOLD,
  DEFAULT_UNCERTAIN_THRESHOLD,
  matchCriterion,
} from '../matching/match.js';
import { detectRunner, type Runner } from '../tests/detect.js';
import { extractTestTitles } from '../tests/extract.js';
import type { Candidate, TestTitle, Verdict } from '../types.js';
import { decideVerdict, evaluateGates, summarize, type CriterionOutcome } from '../verdict.js';
import { VERSION } from '../version.js';
import type { CriterionResult, Report, TestRef } from '../report/types.js';
import { SCHEMA_VERSION } from '../report/types.js';

/**
 * The only place that composes the modules. Everything it needs is passed in:
 * no module below the CLI ever calls `process.cwd()`, which is what lets a
 * GitHub Action hand over `GITHUB_WORKSPACE` and change nothing else.
 */

export interface CheckInput extends DiscoveryOptions {
  runner?: Runner | undefined;
  requireSelector?: boolean | undefined;
  failOn?: Verdict[] | undefined;
  minPass?: number | null | undefined;
  minCoverage?: number | null | undefined;
  failClaimed?: boolean | undefined;
  passThreshold?: number | undefined;
  uncertainThreshold?: number | undefined;
  minSharedTerms?: number | undefined;
}

export interface CheckOutcome {
  report: Report;
  exitCode: number;
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
  if (left.location.file !== right.location.file) {
    return left.location.file < right.location.file ? -1 : 1;
  }
  if (left.location.line !== right.location.line) return left.location.line - right.location.line;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export async function runCheck(input: CheckInput): Promise<CheckOutcome> {
  const discovery = await discover(input);

  const documents = await Promise.all(
    discovery.documents.map(async (document) => ({
      ...parseDocument(await readFile(document.absolutePath, 'utf8'), document.file),
      task: document.task,
    })),
  );

  const { criteria, errors } = buildCriteria(documents);
  // Annotation problems are configuration errors. We surface all of them at
  // once rather than reporting a run built on a document we could not read.
  if (errors.length > 0) throw new AnnotationErrors(errors);

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
  const results: CriterionResult[] = criteria.map((criterion) => {
    const match = matchCriterion(criterion, index, options);
    const verdict = decideVerdict(match.reason);
    outcomes.push({ verdict, reason: match.reason, claimed: criterion.claimed });

    return {
      id: criterion.id,
      verdict,
      reason: match.reason,
      task: criterion.task,
      source: criterion.source,
      section: criterion.section,
      text: criterion.text,
      claimed: criterion.claimed,
      location: { file: criterion.file, line: criterion.line },
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
  const failClaimed = input.failClaimed === true;
  const gates = evaluateGates(summary, { failOn, minPass, minCoverage, failClaimed });

  const report: Report = {
    schemaVersion: SCHEMA_VERSION,
    tool: { name: 'aidd-guard', version: VERSION },
    input: {
      tasksRoot: discovery.relative(discovery.tasksRoot),
      codeRoot: discovery.relative(discovery.codeRoot) || '.',
      runner: detection.runner,
      runnerEvidence: detection.evidence,
      documentCount: discovery.documents.length,
      testFileCount: discovery.testFiles.length,
      testTitleCount: titles.length,
    },
    options: {
      failOn,
      minPass,
      minCoverage,
      failClaimed,
      heuristic: options.heuristic,
      passThreshold: options.passThreshold,
      uncertainThreshold: options.uncertainThreshold,
      minSharedTerms: options.minSharedTerms,
    },
    summary,
    gates,
    results,
    diagnostics: {
      parseWarnings: documents.flatMap((document) =>
        document.warnings.map((warning) => ({
          file: document.file,
          line: warning.line,
          code: warning.code,
          message: warning.message,
        })),
      ),
      unparsedFiles,
      dynamicTitles,
    },
  };

  return { report, exitCode: gates.passed ? EXIT_OK : EXIT_GATE };
}
