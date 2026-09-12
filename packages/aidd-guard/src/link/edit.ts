import { AiddGuardError } from '../errors.js';

/**
 * Writing annotations back into a task document.
 *
 * A pure string function on purpose. Editing someone's documents is the one
 * thing this tool does that is not read-only, so the transformation has to be
 * inspectable in a test without touching a disk.
 *
 * The edit is deliberately minimal: one comment line, indented under the
 * criterion it belongs to, inserted after the criterion's last line. Nothing
 * else on the page moves. No blank line is added either, because a blank line
 * between a bullet and its comment is what turns a tight list into a loose one
 * in every markdown renderer.
 */

export interface LinkEdit {
  /** 1-based line after which the comment goes: the criterion's last line. */
  line: number;
  /** Columns of indentation the criterion itself carries. */
  indent: number;
  /** The full comment, without its newline and without its indentation. */
  annotation: string;
}

export function testAnnotation(selector: string): string {
  return `<!-- aidd-guard:test=${JSON.stringify(selector)} -->`;
}

export function nonTestableAnnotation(reason: string): string {
  return `<!-- aidd-guard:non-testable reason=${JSON.stringify(reason)} -->`;
}

/** A bullet or a checkbox: what a criterion's last line may look like. */
const CRITERION_TAIL = /\S/;
const ANNOTATION = /^\s*<!--\s*aidd-guard:/;

/**
 * Applies edits to one document source.
 *
 * Edits are applied from the bottom up, so an insertion never shifts the line
 * numbers of the ones still to come.
 */
export function applyEdits(source: string, edits: readonly LinkEdit[], file: string): string {
  if (edits.length === 0) return source;

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  const ordered = [...edits].sort((left, right) => right.line - left.line);
  let previous: number | null = null;

  for (const edit of ordered) {
    if (previous !== null && edit.line === previous) {
      throw new AiddGuardError('E_LINK_CONFLICT', 'Two annotations for the same criterion.', {
        file,
        line: edit.line,
      });
    }
    previous = edit.line;

    const index = edit.line - 1;
    const anchor = lines[index];
    if (anchor === undefined || !CRITERION_TAIL.test(anchor)) {
      // The file changed under us between the read and the write. Refusing is
      // the only safe answer: a blind insert would land in another criterion.
      throw new AiddGuardError(
        'E_LINK_CONFLICT',
        'Expected the end of a criterion here. The document changed since it was read.',
        { file, line: edit.line },
      );
    }

    const next = lines[index + 1];
    if (next !== undefined && ANNOTATION.test(next)) {
      throw new AiddGuardError(
        'E_LINK_CONFLICT',
        'This criterion already carries an annotation. Nothing is ever overwritten.',
        { file, line: edit.line + 1 },
      );
    }

    lines.splice(index + 1, 0, `${' '.repeat(edit.indent + 2)}${edit.annotation}`);
  }

  return lines.join(newline);
}
