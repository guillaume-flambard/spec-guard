/**
 * Typed aidd-guard errors.
 *
 * One rule: exit code 2 means the input is at fault (task document, option,
 * annotation), exit code 3 means aidd-guard itself is at fault. Collapsing the
 * two turns every regression of the tool into a hunt for an innocent document.
 */

export const EXIT_OK = 0;
/** A `--fail-on`, `--min-pass` or `--min-coverage` gate was violated, and nothing else. */
export const EXIT_GATE = 1;
/** The input or an option is at fault. */
export const EXIT_INPUT = 2;
/** Unexpected exception: our bug. */
export const EXIT_INTERNAL = 3;

export type ErrorCode =
  // Discovery
  | 'E_TASKS_NOT_FOUND'
  | 'E_TASKS_AMBIGUOUS'
  | 'E_TASKS_EMPTY'
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

export class AiddGuardError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  readonly location: ErrorLocation | null;

  constructor(code: ErrorCode, message: string, location: ErrorLocation | null = null) {
    super(message);
    this.name = 'AiddGuardError';
    this.code = code;
    this.exitCode = EXIT_INPUT;
    this.location = location;
  }

  /** `aidd_docs/tasks/2026_09/x/spec.md:18 [E_ANNOTATION_CONFLICT] message` */
  format(): string {
    const where = this.location ? `${this.location.file}:${this.location.line} ` : '';
    return `${where}[${this.code}] ${this.message}`;
  }
}

export function isAiddGuardError(value: unknown): value is AiddGuardError {
  return value instanceof AiddGuardError;
}

/** Carries every annotation error so the CLI can print them all at once. */
export class AnnotationErrors extends Error {
  readonly exitCode = EXIT_INPUT;
  readonly errors: AiddGuardError[];

  constructor(errors: AiddGuardError[]) {
    super(`${errors.length} annotation error(s)`);
    this.name = 'AnnotationErrors';
    this.errors = errors;
  }
}
