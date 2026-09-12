import { type ErrorCode } from '../errors.js';
import type { Annotation } from '../types.js';

/**
 * aidd-guard annotations.
 *
 * HTML comments placed directly under a criterion line. They are an aidd-guard
 * convention and NEVER AIDD syntax. Comments on purpose: a task document is
 * read by the framework's own skills and scored by `spec-validator.yml`, which
 * count headings and bullets. A `#### aidd-guard metadata` block would become a
 * bogus section; a comment cannot.
 *
 *   - A visitor who submits a valid email receives a confirmation.
 *     <!-- aidd-guard:test="creates a user with a valid email" -->
 *
 *   - [ ] The legal sign-off is recorded.
 *     <!-- aidd-guard:non-testable reason="Requires a human legal assessment" -->
 *
 * The grammar is deliberately rigid. A typo that makes a selector invisible is
 * the worst possible outcome, so anything unrecognized is an error rather than
 * silence.
 */

export interface AnnotationError {
  code: ErrorCode;
  message: string;
  line: number;
}

export interface AnnotationLine {
  text: string;
  line: number;
}

export interface AnnotationParseResult {
  annotation: Annotation | null;
  errors: AnnotationError[];
}

/** Any HTML comment on a line of its own. */
const HTML_COMMENT = /^\s*<!--([\s\S]*?)-->\s*$/;
/** Our namespace inside such a comment. */
const PREFIX = /^\s*aidd-guard:\s*/;
/** `test="..."`, double quotes only, `\"` supported. */
const TEST_DIRECTIVE = /^test\s*=\s*"((?:[^"\\]|\\.)*)"$/;
/** `non-testable reason="..."`, in that order. */
const NON_TESTABLE_DIRECTIVE = /^non-testable\s+reason\s*=\s*"((?:[^"\\]|\\.)*)"$/;
/** Leading verb, used to tell an unknown directive from a malformed one. */
const VERB = /^([a-z][a-z0-9-]*)/;

const KNOWN_VERBS = new Set(['test', 'non-testable']);

/** True when a line carries our namespace, whatever its content. */
export function isAnnotationLine(text: string): boolean {
  const comment = HTML_COMMENT.exec(text);
  return comment !== null && PREFIX.test(comment[1] ?? '');
}

function unescape(raw: string): string {
  return raw.replace(/\\(.)/g, '$1');
}

/**
 * Parses the annotations attached to one criterion.
 *
 * `lines` holds what sits between this criterion and the next one. Unlike a
 * heading-based format, there is no body to close the block: a criterion owns
 * its continuation lines and its comments, and nothing else. Every directive
 * found there belongs to it.
 */
export function parseAnnotations(lines: readonly AnnotationLine[]): AnnotationParseResult {
  const errors: AnnotationError[] = [];
  const found: Annotation[] = [];

  for (const { text, line } of lines) {
    const comment = HTML_COMMENT.exec(text);
    if (!comment) continue;

    const inner = comment[1] ?? '';
    if (!PREFIX.test(inner)) continue; // Foreign HTML comment: not ours.

    const directive = inner.replace(PREFIX, '').trim();
    const annotation = parseDirective(directive, line, errors);
    if (annotation) found.push(annotation);
  }

  return { annotation: reconcile(found, errors), errors };
}

function parseDirective(
  directive: string,
  line: number,
  errors: AnnotationError[],
): Annotation | null {
  const verb = VERB.exec(directive)?.[1];

  if (verb === undefined || !KNOWN_VERBS.has(verb)) {
    errors.push({
      code: 'E_ANNOTATION_UNKNOWN',
      message: `Unknown aidd-guard directive ${JSON.stringify(
        verb ?? directive,
      )}. Known directives: test, non-testable.`,
      line,
    });
    return null;
  }

  if (verb === 'test') {
    const match = TEST_DIRECTIVE.exec(directive);
    if (!match) {
      errors.push({
        code: 'E_ANNOTATION_SYNTAX',
        message:
          'Malformed test directive. Expected <!-- aidd-guard:test="exact test title" --> ' +
          'with double quotes.',
        line,
      });
      return null;
    }
    const selector = unescape(match[1] ?? '').trim();
    if (selector === '') {
      errors.push({
        code: 'E_ANNOTATION_SYNTAX',
        message: 'Empty test selector. Give the exact test title, or remove the directive.',
        line,
      });
      return null;
    }
    return { kind: 'test', selector, line };
  }

  const match = NON_TESTABLE_DIRECTIVE.exec(directive);
  if (!match) {
    errors.push({
      code: 'E_ANNOTATION_SYNTAX',
      message:
        'Malformed non-testable directive. Expected ' +
        '<!-- aidd-guard:non-testable reason="why" --> with double quotes.',
      line,
    });
    return null;
  }
  const reason = unescape(match[1] ?? '').trim();
  if (reason === '') {
    errors.push({
      code: 'E_ANNOTATION_EMPTY_REASON',
      message:
        'non-testable requires a non-empty reason. The reason is what keeps a skipped ' +
        'criterion auditable.',
      line,
    });
    return null;
  }
  return { kind: 'non-testable', reason, line };
}

/** At most one directive per criterion, and the two kinds are exclusive. */
function reconcile(found: readonly Annotation[], errors: AnnotationError[]): Annotation | null {
  const first = found[0];
  if (first === undefined) return null;

  for (const extra of found.slice(1)) {
    if (extra.kind === first.kind) {
      errors.push({
        code: 'E_ANNOTATION_DUPLICATE',
        message: `Duplicate aidd-guard:${extra.kind} directive on the same criterion.`,
        line: extra.line,
      });
    } else {
      errors.push({
        code: 'E_ANNOTATION_CONFLICT',
        message:
          'aidd-guard:test and aidd-guard:non-testable are mutually exclusive. ' +
          'A criterion is either linked to a test or declared not testable.',
        line: extra.line,
      });
    }
  }

  // Any error on a criterion is a configuration error and stops the run, so
  // returning the first directive here only decides what a caller that ignores
  // errors would see.
  return first;
}
