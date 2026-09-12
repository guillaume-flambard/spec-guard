/**
 * The library surface.
 *
 * `runCheck` takes its working directory as a parameter and reads nothing
 * ambient, so a GitHub Action, an editor plugin or another tool can call it
 * without shelling out to the CLI.
 */

export { runCheck, type CheckInput, type CheckOutcome } from './commands/check.js';
export {
  runLink,
  type LinkAsk,
  type LinkChoice,
  type LinkInput,
  type LinkProposal,
  type LinkResult,
} from './commands/link.js';
export { renderJson } from './report/json.js';
export { renderTerminal, type TerminalOptions } from './report/terminal.js';
export { SCHEMA_VERSION } from './report/types.js';
export type {
  CriterionResult,
  Report,
  ReportDiagnostics,
  ReportInput,
  ReportMatch,
  ReportOptions,
  TestRef,
} from './report/types.js';
export { parseDocument, type ParsedCriterion, type ParsedDocument } from './aidd/parse.js';
export { deriveId } from './criteria.js';
export { DEFAULT_DOC_GLOBS, DEFAULT_TEST_GLOBS, type DiscoveryOptions } from './discovery.js';
export {
  AiddGuardError,
  AnnotationErrors,
  EXIT_GATE,
  EXIT_INPUT,
  EXIT_INTERNAL,
  EXIT_OK,
  isAiddGuardError,
  type ErrorCode,
} from './errors.js';
export { decideVerdict, summarize, evaluateGates, type Summary } from './verdict.js';
export type {
  Annotation,
  Candidate,
  Criterion,
  CriterionSource,
  MatchReason,
  TestTitle,
  Verdict,
} from './types.js';
export { VERSION } from './version.js';
