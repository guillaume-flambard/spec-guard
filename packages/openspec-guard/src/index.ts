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
} from './errors.js';
export {
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
} from './baseline.js';
export { renderJson } from './report/json.js';
export {
  renderTerminal,
  DEFAULT_TERMINAL_OPTIONS,
  type TerminalOptions,
} from './report/terminal.js';
export {
  SCHEMA_VERSION,
  type CriterionResult,
  type Report,
  type ReportDiagnostics,
  type ReportInput,
  type ReportOptions,
  type TestRef,
} from './report/types.js';
export { type Runner } from './tests/detect.js';
export {
  type Annotation,
  type Criterion,
  type MatchReason,
  type TestTitle,
  type Verdict,
} from './types.js';
export { type Summary } from './verdict.js';
export { VERSION } from './version.js';
