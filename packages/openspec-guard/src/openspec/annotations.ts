import { type ErrorCode } from '../errors.js';
import type { Annotation } from '../types.js';

/**
 * OpenSpec Guard annotations.
 *
 * These are HTML comments placed directly under a scenario heading. They are a
 * documented OpenSpec Guard convention and NEVER OpenSpec syntax. They are comments
 * on purpose: the official OpenSpec parser treats every `####` heading as a
 * scenario, so a `#### OpenSpec Guard metadata` block would silently become a bogus
 * scenario.
 *
 *   #### Scenario: Sign up with a valid email
 *   <!-- openspec-guard:test="creates a user with a valid email" -->
 *
 *   #### Scenario: Manual compliance sign-off
 *   <!-- openspec-guard:non-testable reason="Requires a human legal assessment" -->
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
const PREFIX = /^\s*openspec-guard:\s*/;
/** `test="..."`, double quotes only, `\"` supported. */
const TEST_DIRECTIVE = /^test\s*=\s*"((?:[^"\\]|\\.)*)"$/;
/** `non-testable reason="..."`, in that order. */
const NON_TESTABLE_DIRECTIVE = /^non-testable\s+reason\s*=\s*"((?:[^"\\]|\\.)*)"$/;
/** Leading verb, used to tell an unknown directive from a malformed one. */
const VERB = /^([a-z][a-z0-9-]*)/;

const KNOWN_VERBS = new Set(['test', 'non-testable']);

function unescape(raw: string): string {
  return raw.replace(/\\(.)/g, '$1');
}

/**
 * Parses the annotations of one scenario.
 *
 * `bodyLines` is the whole scenario body with line numbers. Directives are only
 * recognized in the contiguous block that follows the heading: blank lines are
 * tolerated before them, but the first line of real content (a bullet, prose)
 * closes the block. A `openspec-guard:` directive found after that point is an
 * error, not a silent no-op, for the same reason the grammar is rigid.
 */
export function parseAnnotations(bodyLines: readonly AnnotationLine[]): AnnotationParseResult {
  const errors: AnnotationError[] = [];
  const found: Annotation[] = [];

  let blockClosed = false;

  for (const { text, line } of bodyLines) {
    const comment = HTML_COMMENT.exec(text);

    if (!comment) {
      if (text.trim() !== '') blockClosed = true;
      continue;
    }

    const inner = comment[1] ?? '';
    if (!PREFIX.test(inner)) continue; // Foreign HTML comment: not ours.

    if (blockClosed) {
      errors.push({
        code: 'E_ANNOTATION_MISPLACED',
        message:
          'openspec-guard directive found after the start of the scenario body. ' +
          'Directives must sit directly under the scenario heading.',
        line,
      });
      continue;
    }

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
      message: `Unknown openspec-guard directive ${JSON.stringify(
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
          'Malformed test directive. Expected <!-- openspec-guard:test="exact test title" --> ' +
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
        '<!-- openspec-guard:non-testable reason="why" --> with double quotes.',
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

/** At most one directive per scenario, and the two kinds are exclusive. */
function reconcile(found: readonly Annotation[], errors: AnnotationError[]): Annotation | null {
  const first = found[0];
  if (first === undefined) return null;

  for (const extra of found.slice(1)) {
    if (extra.kind === first.kind) {
      errors.push({
        code: 'E_ANNOTATION_DUPLICATE',
        message: `Duplicate openspec-guard:${extra.kind} directive on the same scenario.`,
        line: extra.line,
      });
    } else {
      errors.push({
        code: 'E_ANNOTATION_CONFLICT',
        message:
          'openspec-guard:test and openspec-guard:non-testable are mutually exclusive. ' +
          'A scenario is either linked to a test or declared not testable.',
        line: extra.line,
      });
    }
  }

  // Any error on a scenario is a configuration error and stops the run, so
  // returning the first directive here only decides what a caller that ignores
  // errors would see.
  return first;
}
