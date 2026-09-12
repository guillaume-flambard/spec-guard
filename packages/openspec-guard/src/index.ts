/**
 * Programmatic API.
 *
 * `runCheck` takes its working directory as a parameter and returns the report
 * plus an exit code. The GitHub Action will call exactly this, passing
 * `GITHUB_WORKSPACE`, and nothing else will need to change.
 */

export {
  runCheck,
  AnnotationErrors,
  type CheckInput,
  type CheckOutcome,
} from './commands/check.js';
export {
  EXIT_GATE,
  EXIT_INPUT,
  EXIT_INTERNAL,
  EXIT_OK,
  isOpenSpecGuardError,
  OpenSpecGuardError,
  type ErrorCode,
  buildBaseline,
  diffBaseline,
  isBaselined,
  loadBaseline,
  staleEntries,
  writeBaseline,
  DEFAULT_BASELINE_PATH,
  BASELINE_SCHEMA_VERSION,
  type Baseline,
  type BaselineEntry,
  type BaselineFile,
  renderJson,
  renderTerminal,
  DEFAULT_TERMINAL_OPTIONS,
  type TerminalOptions,
  SCHEMA_VERSION,
  type CriterionResult,
  type Report,
  type ReportDiagnostics,
  type ReportInput,
  type ReportOptions,
  type TestRef,
  type Runner,
  type Annotation,
  type Criterion,
  type MatchReason,
  type TestTitle,
  type Verdict,
  type Summary,
} from '@spec-guard/core';
export { VERSION } from './version.js';
