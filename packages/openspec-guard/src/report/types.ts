import type { DeltaOperation, MatchReason, Verdict } from '../types.js';
import type { Summary } from '../verdict.js';

/**
 * The report shape. This is the public contract of `--format json`, so the
 * guarantees below are part of the product, not an implementation detail:
 *
 *  - no timestamp, no duration, no absolute path, no machine name, anywhere.
 *    Two runs on the same input produce the same bytes;
 *  - every path is relative to the working directory, POSIX separators;
 *  - `results` is sorted by (file, line, id);
 *  - arrays are always present, absent scalars are `null` and never omitted,
 *    so a diff between two reports stays readable;
 *  - scores are rounded to four decimals.
 */

export const SCHEMA_VERSION = 1;

export interface TestRef {
  fullName: string;
  file: string;
  line: number;
  skipped: boolean;
}

export interface ReportMatch {
  score: number;
  matchedOn: 'leaf' | 'fullName' | null;
  sharedTerms: string[];
  test: TestRef | null;
  runnersUp: TestRef[];
}

export interface CriterionResult {
  id: string;
  verdict: Verdict;
  reason: MatchReason;
  capability: string;
  requirement: string;
  scenario: string;
  operation: DeltaOperation;
  /** `false` when the source heading was not `#### Scenario: ...`. */
  namedScenario: boolean;
  /** True when a baseline is holding this criterion back from the gate. */
  baselined: boolean;
  source: { file: string; line: number };
  selector: string | null;
  nonTestableReason: string | null;
  match: ReportMatch;
}

export interface ReportInput {
  specRoot: string;
  codeRoot: string;
  runner: string;
  runnerEvidence: string[];
  specFileCount: number;
  testFileCount: number;
  testTitleCount: number;
  /** Scenarios under a REMOVED delta section: counted, never checked. */
  removedScenarioCount: number;
}

export interface ReportOptions {
  /** Path of the baseline in use, relative to cwd. */
  baseline: string | null;
  failOn: Verdict[];
  minPass: number | null;
  minCoverage: number | null;
  heuristic: boolean;
  includeChanges: boolean;
  passThreshold: number;
  uncertainThreshold: number;
  minSharedTerms: number;
}

export interface ReportDiagnostics {
  parseWarnings: { file: string; line: number; code: string; message: string }[];
  /** Baseline entries matching no current criterion: prune them. */
  staleBaselineEntries: { id: string; scenario: string; file: string }[];
  unparsedFiles: { file: string; message: string }[];
  dynamicTitles: { file: string; line: number; reason: string }[];
}

export interface Report {
  schemaVersion: number;
  tool: { name: string; version: string };
  input: ReportInput;
  options: ReportOptions;
  summary: Summary;
  gates: { passed: boolean; violations: string[] };
  results: CriterionResult[];
  diagnostics: ReportDiagnostics;
}
