import { type ErrorCode } from './errors.js';
import type { AnnotationVocabulary } from './format.js';
import type { Annotation, AnnotationLine } from './types.js';

/**
 * Guard annotations.
 *
 * These are HTML comments placed directly under a criterion heading. They are
 * a documented convention of this tool and NEVER syntax the spec format
 * defines itself. They are comments on purpose: a spec format's own parser
 * usually treats every heading as structure, so a `#### Guard metadata` block
 * would silently become a bogus criterion.
 *
 *   #### Scenario: Sign up with a valid email
 *   <!-- <prefix>:test="creates a user with a valid email" -->
 *
 *   #### Scenario: Manual compliance sign-off
 *   <!-- <prefix>:non-testable reason="Requires a human legal assessment" -->
 *
 * The namespace before the colon is the format's, never a literal here: it is
 * read from `annotationPrefix` and `acceptedPrefixes`, and the id normalizer
 * strips exactly what this module accepts, from that same pair.
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

export interface AnnotationParseResult {
  annotation: Annotation | null;
  errors: AnnotationError[];
}

/** Any HTML comment on a line of its own. */
const HTML_COMMENT = /^\s*<!--([\s\S]*?)-->\s*$/;
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

/** Never matches: an empty `acceptedPrefixes` claims no comment at all. */
const MATCHES_NOTHING = /(?!)/;

const PREFIX_CACHE = new Map<string, RegExp>();

/**
 * Our namespace inside an HTML comment, for every spelling this binary accepts.
 *
 * The single derivation of the prefix. `parseAnnotations` and
 * `normalizeScenarioText` both come through here, so the set of comments that
 * are parsed as directives and the set that are stripped before hashing cannot
 * drift apart. If they ever did, adding a selector would move a criterion id
 * and invalidate every baseline in the wild.
 */
export function prefixPattern(format: AnnotationVocabulary): RegExp {
  const key = format.acceptedPrefixes.join('\u0000');
  const cached = PREFIX_CACHE.get(key);
  if (cached) return cached;

  if (format.acceptedPrefixes.length === 0) return MATCHES_NOTHING;

  // Longest first, so one accepted prefix that ends with another still wins
  // its own spelling.
  const alternatives = [...format.acceptedPrefixes]
    .sort((left, right) => right.length - left.length)
    .map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(`^\\s*(?:${alternatives}):\\s*`);
  PREFIX_CACHE.set(key, pattern);
  return pattern;
}

/**
 * True when this line is one of our directives, whatever it says.
 *
 * `normalizeScenarioText` calls exactly this to decide what to strip before
 * hashing. It is not a second regex that happens to agree.
 */
export function isAnnotationComment(text: string, format: AnnotationVocabulary): boolean {
  const comment = HTML_COMMENT.exec(text);
  if (!comment) return false;
  return prefixPattern(format).test(comment[1] ?? '');
}

/**
 * Parses the annotations of one scenario.
 *
 * `bodyLines` is the whole scenario body with line numbers. Directives are only
 * recognized in the contiguous block that follows the heading: blank lines are
 * tolerated before them, but the first line of real content (a bullet, prose)
 * closes the block. A directive found after that point is an error, not a
 * silent no-op, for the same reason the grammar is rigid.
 */
export function parseAnnotations(
  bodyLines: readonly AnnotationLine[],
  format: AnnotationVocabulary,
): AnnotationParseResult {
  const errors: AnnotationError[] = [];
  const found: Annotation[] = [];
  const prefix = prefixPattern(format);

  let blockClosed = false;

  for (const { text, line } of bodyLines) {
    const comment = HTML_COMMENT.exec(text);

    if (!comment) {
      if (text.trim() !== '') blockClosed = true;
      continue;
    }

    const inner = comment[1] ?? '';
    if (!prefix.test(inner)) continue; // Foreign HTML comment: not ours.

    if (blockClosed) {
      errors.push({
        code: 'E_ANNOTATION_MISPLACED',
        message:
          `${format.annotationPrefix} directive found after the start of the scenario body. ` +
          'Directives must sit directly under the scenario heading.',
        line,
      });
      continue;
    }

    const directive = inner.replace(prefix, '').trim();
    const annotation = parseDirective(directive, line, errors, format);
    if (annotation) found.push(annotation);
  }

  return { annotation: reconcile(found, errors, format), errors };
}

function parseDirective(
  directive: string,
  line: number,
  errors: AnnotationError[],
  format: AnnotationVocabulary,
): Annotation | null {
  const verb = VERB.exec(directive)?.[1];

  if (verb === undefined || !KNOWN_VERBS.has(verb)) {
    errors.push({
      code: 'E_ANNOTATION_UNKNOWN',
      message: `Unknown ${format.annotationPrefix} directive ${JSON.stringify(
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
          'Malformed test directive. Expected ' +
          `<!-- ${format.annotationPrefix}:test="exact test title" --> ` +
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
        `<!-- ${format.annotationPrefix}:non-testable reason="why" --> with double quotes.`,
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
function reconcile(
  found: readonly Annotation[],
  errors: AnnotationError[],
  format: AnnotationVocabulary,
): Annotation | null {
  const first = found[0];
  if (first === undefined) return null;

  for (const extra of found.slice(1)) {
    if (extra.kind === first.kind) {
      errors.push({
        code: 'E_ANNOTATION_DUPLICATE',
        message: `Duplicate ${format.annotationPrefix}:${extra.kind} directive on the same scenario.`,
        line: extra.line,
      });
    } else {
      errors.push({
        code: 'E_ANNOTATION_CONFLICT',
        message:
          `${format.annotationPrefix}:test and ${format.annotationPrefix}:non-testable are ` +
          'mutually exclusive. A scenario is either linked to a test or declared not testable.',
        line: extra.line,
      });
    }
  }

  // Any error on a scenario is a configuration error and stops the run, so
  // returning the first directive here only decides what a caller that ignores
  // errors would see.
  return first;
}
