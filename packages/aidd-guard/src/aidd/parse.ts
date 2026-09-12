import type { CriterionSource } from '../types.js';

import { isAnnotationLine, type AnnotationLine } from './annotations.js';

/**
 * The AIDD task-document parser.
 *
 * It reads two carriers, and only two:
 *
 *   1. a bullet under the `## Done-when` heading of a `spec.md`;
 *   2. a `- [ ]` / `- [x]` checkbox anywhere in a plan or phase document.
 *
 * Everything else in the document is ignored on purpose. The template also
 * carries `## Hard constraints`, but a constraint is a bound on the solution,
 * not an outcome anyone can observe a test producing, and pretending otherwise
 * would fill the report with criteria no test can ever satisfy.
 *
 * Four things in the real corpus break a naive reader, and each one is handled
 * here rather than left to chance:
 *
 *   - **Multi-line HTML comments.** Every template ships an
 *     `<!-- AI INSTRUCTIONS ONLY ... -->` block whose body is a bulleted list.
 *     Read line by line, those bullets become criteria that nobody wrote.
 *   - **Fenced code.** A `mermaid` diagram or a shell snippet contains dashes
 *     and brackets that look exactly like bullets.
 *   - **Wrapped criteria.** Real criteria run past the line width and continue
 *     on the next, more-indented line. Cut at the newline, half of every long
 *     criterion disappears and the matching that follows is a lie.
 *   - **Unfilled placeholders.** A document generated from the template but
 *     never filled still carries `{verifiable boolean condition 1}`. That is a
 *     placeholder, never a criterion.
 */

export interface ParsedCriterion {
  source: CriterionSource;
  section: string;
  text: string;
  /** 1-based line of the criterion's first line. */
  line: number;
  /**
   * 1-based line of its last line. Equal to `line` unless the criterion wrapped.
   *
   * Carried because an annotation has to be written *after* the whole
   * criterion: inserting it between a criterion's first and second line reads
   * as if it belonged to something else.
   */
  endLine: number;
  /** Columns of indentation before the bullet marker, used when writing back. */
  indent: number;
  /** `null` for a `done-when` bullet, which has no box. */
  claimed: boolean | null;
  /** Continuation lines and comments that belong to this criterion. */
  attached: AnnotationLine[];
}

export interface ParseWarning {
  code: string;
  message: string;
  line: number;
}

export interface ParsedDocument {
  /** Path relative to cwd, POSIX separators. */
  file: string;
  criteria: ParsedCriterion[];
  warnings: ParseWarning[];
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const CHECKBOX = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(?!\[[ xX]\]\s)(.*)$/;
const ONE_LINE_COMMENT = /^\s*<!--[\s\S]*?-->\s*$/;
const COMMENT_OPEN = /<!--/;
const COMMENT_CLOSE = /-->/;
/** A line that is nothing but an unfilled template placeholder. */
const PLACEHOLDER = /^[{<][^}>]*[}>]$/;

/** `## Done-when`, and the spellings a human actually types for it. */
function isDoneWhenHeading(text: string): boolean {
  return /^done[-\s]?when\b/i.test(text.trim());
}

/**
 * True for a heading that closes the Done-when section. Any `##` does, and so
 * does any heading of the same or higher level.
 */
function closesSection(level: number, sectionLevel: number): boolean {
  return level <= sectionLevel;
}

function stripTrailing(text: string): string {
  return text.replace(/\s+$/, '');
}

export function parseDocument(content: string, file: string): ParsedDocument {
  const lines = content.split(/\r?\n/);
  const criteria: ParsedCriterion[] = [];
  const warnings: ParseWarning[] = [];

  let inFence = false;
  let inComment = false;
  let section = '';
  let doneWhenLevel: number | null = null;
  let current: ParsedCriterion | null = null;
  let currentIndent = 0;

  const close = (): void => {
    if (current === null) return;
    if (PLACEHOLDER.test(current.text.trim())) {
      warnings.push({
        code: 'W_PLACEHOLDER',
        message: 'Unfilled template placeholder, not counted as a criterion.',
        line: current.line,
      });
      current = null;
      return;
    }
    current.text = current.text.trim();
    if (current.text !== '') criteria.push(current);
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    const line = index + 1;

    // An HTML comment can open and close on the same line, or span many. The
    // annotation reader needs single-line comments, so only a block that stays
    // open past its own line suppresses what follows.
    if (inComment) {
      if (COMMENT_CLOSE.test(raw)) inComment = false;
      continue;
    }
    if (COMMENT_OPEN.test(raw) && !COMMENT_CLOSE.test(raw)) {
      inComment = true;
      close();
      continue;
    }

    if (FENCE.test(raw)) {
      inFence = !inFence;
      close();
      continue;
    }
    if (inFence) continue;

    const heading = HEADING.exec(raw);
    if (heading) {
      close();
      const level = (heading[1] ?? '').length;
      const text = stripTrailing(heading[2] ?? '').trim();
      if (doneWhenLevel !== null && closesSection(level, doneWhenLevel)) doneWhenLevel = null;
      if (isDoneWhenHeading(text)) doneWhenLevel = level;
      section = text;
      continue;
    }

    const checkbox = CHECKBOX.exec(raw);
    if (checkbox) {
      close();
      const box = (checkbox[2] ?? ' ').toLowerCase();
      current = {
        source: 'checkbox',
        section,
        text: stripTrailing(checkbox[3] ?? ''),
        line,
        endLine: line,
        indent: (checkbox[1] ?? '').length,
        claimed: box === 'x',
        attached: [],
      };
      currentIndent = (checkbox[1] ?? '').length;
      continue;
    }

    const bullet = BULLET.exec(raw);
    if (bullet && doneWhenLevel !== null) {
      close();
      current = {
        source: 'done-when',
        section,
        text: stripTrailing(bullet[2] ?? ''),
        line,
        endLine: line,
        indent: (bullet[1] ?? '').length,
        claimed: null,
        attached: [],
      };
      currentIndent = (bullet[1] ?? '').length;
      continue;
    }

    if (current === null) continue;

    // Attached to the criterion above: an annotation comment, or the rest of a
    // criterion that ran past the line width. A comment is never text, ours or
    // not: a note left for a human would otherwise end up inside the criterion
    // and rotate its identifier.
    if (ONE_LINE_COMMENT.test(raw)) {
      if (isAnnotationLine(raw)) current.attached.push({ text: raw, line });
      continue;
    }

    if (raw.trim() === '') {
      // A blank line ends a criterion only when nothing is attached yet: an
      // annotation is routinely written after one.
      if (current.attached.length > 0) close();
      continue;
    }

    const indent = raw.length - raw.trimStart().length;
    if (bullet || indent <= currentIndent) {
      close();
      continue;
    }

    current.text = `${current.text} ${raw.trim()}`;
    current.endLine = line;
  }

  close();
  if (inFence) {
    warnings.push({
      code: 'W_UNCLOSED_FENCE',
      message: 'Unclosed code fence. Everything after it was ignored.',
      line: lines.length,
    });
  }

  return { file, criteria, warnings };
}
