/**
 * The format-neutral engine. Everything here is independent of which spec
 * format produced the criteria.
 *
 * The surface is wider than what `openspec-guard` used to publish to npm:
 * `commands/check.ts` and `commands/link.ts` stay behind as the composition
 * root, so nearly everything they compose has to cross the package boundary
 * too. Only the OpenSpec markdown grammar (`parseSpec`) and the CLI itself
 * stay format-specific.
 */

export {
  buildCriteria,
  criterionId,
  disambiguateIds,
  normalizeScenarioText,
  type BuildCriteriaResult,
} from './criteria.js';
export {
  discover,
  toRelativePosix,
  DEFAULT_TEST_GLOBS,
  type Discovery,
  type DiscoveryOptions,
  type DiscoveredSpec,
  type Manifest,
} from './discovery.js';
export {
  EXIT_GATE,
  EXIT_INPUT,
  EXIT_INTERNAL,
  EXIT_OK,
  isSpecGuardError,
  SpecGuardError,
  isOpenSpecGuardError,
  OpenSpecGuardError,
  type ErrorCode,
  type ErrorLocation,
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
  type BaselineCandidate,
  type BaselineDiff,
  type BaselineEntry,
  type BaselineFile,
} from './baseline.js';
export {
  buildTestIndex,
  matchCriterion,
  DEFAULT_MATCH_OPTIONS,
  DEFAULT_MIN_SHARED_TERMS,
  DEFAULT_PASS_THRESHOLD,
  DEFAULT_UNCERTAIN_THRESHOLD,
  type MatchOptions,
} from './matching/match.js';
export { normalize } from './matching/normalize.js';
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
export { detectRunner, type Runner } from './tests/detect.js';
export { extractTestTitles } from './tests/extract.js';
export {
  type Annotation,
  type AnnotationLine,
  type Candidate,
  type Criterion,
  type DeltaOperation,
  type MatchReason,
  type ParsedRequirement,
  type ParsedScenario,
  type ParsedSpec,
  type ParseWarning,
  type TestTitle,
  type Verdict,
} from './types.js';
export {
  decideVerdict,
  evaluateGates,
  summarize,
  type CriterionOutcome,
  type Summary,
} from './verdict.js';
