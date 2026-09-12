import type { CriterionSource, MatchReason, Verdict } from '../types.js';
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
  task: string;
  source: CriterionSource;
  section: string;
  text: string;
  /** `true` when the box was ticked, `null` for a Done-when line. */
  claimed: boolean | null;
  location: { file: string; line: number };
  selector: string | null;
  nonTestableReason: string | null;
  match: ReportMatch;
}

export interface ReportInput {
  tasksRoot: string;
  codeRoot: string;
  runner: string;
  runnerEvidence: string[];
  documentCount: number;
  testFileCount: number;
  testTitleCount: number;
}

export interface ReportOptions {
  failOn: Verdict[];
  minPass: number | null;
  minCoverage: number | null;
  failClaimed: boolean;
  heuristic: boolean;
  passThreshold: number;
  uncertainThreshold: number;
  minSharedTerms: number;
}

export interface ReportDiagnostics {
  parseWarnings: { file: string; line: number; code: string; message: string }[];
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
