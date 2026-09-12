/**
 * Typed SpecGuard errors.
 *
 * One rule: exit code 2 means the input is at fault (spec, option, annotation),
 * exit code 3 means SpecGuard itself is at fault. Collapsing the two turns
 * every regression of the tool into a hunt for an innocent spec file.
 */

export const EXIT_OK = 0;
/** A `--fail-on` or `--min-pass` gate was violated, and nothing else. */
export const EXIT_GATE = 1;
/** The input or an option is at fault. */
export const EXIT_INPUT = 2;
/** Unexpected exception: our bug. */
export const EXIT_INTERNAL = 3;

export type ErrorCode =
  // Discovery
  | 'E_SPECS_NOT_FOUND'
  | 'E_SPECS_AMBIGUOUS'
  | 'E_SPECS_EMPTY'
  | 'E_CODE_NOT_FOUND'
  | 'E_NO_CRITERIA'
  // Runner
  | 'E_RUNNER_NOT_FOUND'
  // Annotations
  | 'E_ANNOTATION_SYNTAX'
  | 'E_ANNOTATION_CONFLICT'
  | 'E_ANNOTATION_DUPLICATE'
  | 'E_ANNOTATION_UNKNOWN'
  | 'E_ANNOTATION_EMPTY_REASON'
  | 'E_ANNOTATION_MISPLACED'
  // Baseline
  | 'E_BASELINE_NOT_FOUND'
  | 'E_BASELINE_INVALID'
  // Link
  | 'E_LINK_CONFLICT'
  | 'E_LINK_EMPTY_SELECTOR'
  // Options
  | 'E_OPTION';

export interface ErrorLocation {
  /** Path relative to cwd, POSIX separators. */
  file: string;
  /** 1-based line number. */
  line: number;
}

export class OpenSpecGuardError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  readonly location: ErrorLocation | null;

  constructor(code: ErrorCode, message: string, location: ErrorLocation | null = null) {
    super(message);
    this.name = 'OpenSpecGuardError';
    this.code = code;
    this.exitCode = EXIT_INPUT;
    this.location = location;
  }

  /** `openspec/specs/account/spec.md:18 [E_ANNOTATION_CONFLICT] message` */
  format(): string {
    const where = this.location ? `${this.location.file}:${this.location.line} ` : '';
    return `${where}[${this.code}] ${this.message}`;
  }
}

export function isOpenSpecGuardError(value: unknown): value is OpenSpecGuardError {
  return value instanceof OpenSpecGuardError;
}
